
const nn = require('./nn')
const model_selection = require('./model_selection')
const prep = require('./preprocessing')
const op = require('optimization-js')
const base = require('./base')
const opt = require('optimization-js')
const aml = require('./automljs')
const utils = require('./utils')

function determine_estimator(output){
    if(output['type'] === 'number'){
        return new nn.MLPRegressor()
    }else{
        return new nn.MLPClassifier()
    }
}

async function fill_last_column(dataset, callback, n_iter, max_epochs=100){
    
    // training features
    var X = dataset.map((v)=>v.slice(0, -1))
    var y = dataset.map((v)=>v.slice(-1)[0])

    // select all inputs with missing outputs
    var I = y.map((v, ix)=>ix)

    // these values need filling in
    var missing = I.filter((v, ix)=>y[ix]==='')

    // select all samples for training 
    var X_miss = X.filter((v, ix)=>y[ix]==='')
    var Xs = X.filter((v, ix)=>y[ix]!=='')
    var ys = y.filter((v, ix)=>y[ix]!=='')

    var [X_train, X_test, y_train, y_test] = model_selection.train_test_split([Xs, ys])

    // extract features
    var feats = new prep.TableFeaturesTransformer()
    await feats.fit(X_train, y_train)
    X_train = await feats.transform(X_train)
    X_test = await feats.transform(X_test)
    X_miss = await feats.transform(X_miss)
    
    // scale features
    var scaler = new prep.StandardScaler()
    await scaler.fit(X_train, y_train)
    X_train = await scaler.transform(X_train)
    X_test = await scaler.transform(X_test)
    X_miss = await scaler.transform(X_miss)

    // set up tuning algo
    var opt = new op.OMGOptimizer([
        new op.Integer(1, max_epochs),
        new op.Real(-4, -1)
    ])

    var best_score = null
    var best_model = null
    var state = {'dataset': dataset}
    
    // run the optimization cycle
    for(var iteration=0; iteration<n_iter; iteration++){
        var point = await opt.ask();
        var [epochs, lr] = point

        var model = await determine_estimator(feats.state['output'])

        model.params['epochs'] = epochs
        model.params['lr'] = Math.pow(10, lr)

        await model.fit(X_train, y_train)
        var score = await model.score(X_test, y_test)
        
        opt.tell([point], [-score])

        if((best_score === null) || (best_score < score)){
            best_score = score
            best_model = model

            var y_pred = model.predict(X_miss)

            var last_feature = dataset[0].length-1
            
            for(var [iy, v] of y_pred.entries()){
                dataset[missing[iy]][last_feature] = y_pred[iy]
            }
        }
        
        state['best_score'] = best_score
        state['iteration'] = iteration

        var result = callback(state)
        if(result === 'cancel'){
            break
        }
    }

    return state
}

module.exports.fill_last_column = fill_last_column


/**
 * A fully automated class for fitting to the data.
 * Automatically splits the data into training and testing,
 * select the algorithms to apply on the data, and generates
 * report on how well the models perform. 
 * The communication of the class to the outside world is 
 * done via the events. A new event can be created using
 * this.event_type[event_name] = event_handler.
 */
class AutoMLModel extends base.BaseEstimator{
    /**
     * @param {Object} params Configuration of AutoML algorithm.
     */
    constructor(params){
        super(params, {
            'max_iter': 1000,
        })

        // named events for the situation where a score for some 
        // type of model has been improved
        this.on_improve = {}

        // some ML fitting step has been done. This does not 
        // necessary imply any kind of improvement.
        this.on_step = {}
    }

    /**
     * Run the automated algorithm search.
     * Current algorithm: 
     * 1. Split the data into train / test partitions
     * 2. Optimize progressively a number of models, some specifically 
     * smaller for interpretation, some larger "black box" models for
     * high accuracy
     * @param {Array} X Array of input samples
     * @param {Array} y Array of target outputs
     */
    async fit(X, y){
        /*
        ToDo: Desired algorithm:
        1. Is the data historical?
        Y: split over time stamp
        N: split at random

        2. If the data is historical, does historical context
        help for estimation of the outputs?
        Y: Use a context for training. Context is determined by sequence ID.
        N: Use a single sample for training
        
        3. Optimize a number of models.
        */

        // extract features
        // train small decision tree
        // train large decision tree (bb)
        // train linear model with L1 regularization
        // train complete linear model (bb)
        // train gradient boosting model (bb)

        var features = new prep.TableFeaturesTransformer({})

        // extract features
        await features.fit(X, y)
        X = await features.transform(X, y)

        // remember the feature transformer
        this.state['features'] = features

        // determine type of the learning problem
        var regression = features.state['output']['type'] === 'number'

        // search parameters
        var grids = {
            'tree_small': {
                'max_depth': new opt.Integer(4)
            },
            'tree': {
                'max_depth': new opt.Integer(8)
            },
            'lsgd': {
                'alpha': new opt.Real(0.0001, 10.0),
                'max_iter': new opt.Integer(16, 64),
                'l1_ratio': new opt.Real(0.0, 1.0)
            },
            'gbdt': {
                'learning_rate': new opt.Real(0.001, 1.0),
                'n_estimators': new opt.Integer(16, 256),
                'max_depth': new opt.Integer(1, 4)
            }
        }

        var estimators = {}

        if(regression){
            estimators['tree_small'] = new aml.tree.DecisionTreeRegressor()
            estimators['tree'] = new aml.tree.DecisionTreeRegressor()
            estimators['lsgd'] = new aml.linear_model.SGDRegressor()
            estimators['gbdt'] = new aml.ensemble.GradientBoostingRegressor()
        }else{
            estimators['tree_small'] = new aml.tree.DecisionTreeClassifier()
            estimators['tree'] = new aml.tree.DecisionTreeClassifier()
            estimators['lsgd'] = new aml.linear_model.SGDClassifier()
            estimators['gbdt'] = new aml.ensemble.GradientBoostingClassifier()
        }

        // initialize the corresponding *SearchCV models
        var optimizers = {}

        for(var model_name in grids){
            var scv = new aml.model_selection.OMGSearchCV({
                'estimator': estimators[model_name],
                'param_grid': grids[model_name],
                'refit_on_improvement': true,  // search will be done manually
                'cv': 3
            })
            
            await scv.init(X, y)

            optimizers[model_name] = scv
        }

        // run the parameter search algorithm
        var n_iter = this.params['max_iter']
        var i = 0

        // optimize the algorithms in round robin fashion
        while(i < n_iter){
            for(var model_name in optimizers){
                if(!(i < n_iter)){
                    break
                }

                var iter_result = {
                    'iteration': i,
                    'n_iter': n_iter,
                    'model_name': model_name
                }

                var scv = optimizers[model_name]
                var result = await scv.step()

                // assign only when there is already some estimator
                this.state[model_name] = scv

                if(result['improved']){
                    var score = scv.state['best_score_']
                    var current_best = this.state['best_score_'] || null
                    
                    // check for improvement overall
                    if(current_best === null || current_best < score){
                        this.state['best_score_'] = score
                        this.state['best_estimator_'] = scv
                    }

                    for(var k in this.on_improve){
                        if(this.on_improve[k] === null){
                            continue
                        }
                        var callback_result = this.on_improve[k](iter_result) || false
                        
                        // terminate if the callback says so
                        if(callback_result){
                            i = Number.POSITIVE_INFINITY
                        }
                    }
                }

                for(var k in this.on_step){
                    if(this.on_step[k] === null){
                        continue
                    }
                    var callback_result = this.on_step[k](iter_result) || false
                    
                    // terminate if the callback says so
                    if(callback_result){
                        i = Number.POSITIVE_INFINITY
                    }
                }

                i++
            }
        }

    }

    /**
     * Get estimations with the best performing model.
     * @param {Array} X Array of input observations
     */
    async predict(X){
        utils.check_is_fitted(this, ['best_estimator_'])
        var features = this.state['features']
        var estimator = this.state['best_estimator_']
        var X = await features.transform(X)
        var y_pred = await estimator.predict(X)
        return y_pred
    }

    /**
     * Calculates the score of the best performing model
     * on the dataset provided.
     * @param {Array} X Array of input observations
     * @param {Array} y Array of output values.
     */
    async score(X, y){
        utils.check_is_fitted(this, ['best_estimator_'])
        var features = this.state['features']
        var estimator = this.state['best_estimator_']
        var X = await features.transform(X)
        var score = await estimator.score(X, y)
        return score
    }
}

module.exports.AutoMLModel = AutoMLModel