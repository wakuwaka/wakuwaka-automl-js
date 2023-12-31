
const base = require('./base')
const RegressorMixin = base.RegressorMixin
const BaseEstimator = base.BaseEstimator
const utils = require('./utils')
const tf = require('@tensorflow/tfjs')
const prep = require('./preprocessing')

/*
class SGDRegressor extends RegressorMixin(BaseEstimator){
    
    constructor(params){
        super(params, {
            'alpha': 0.0001,
            'l1_ratio': 0.15,
            'max_iter': 1000,
            'eta0': 0.01,
            'batch_size': 1
        })
    }

    async fit(X, y){
        var [X, y] = utils.check_2dXy(X, y)

        var l1_ratio = this.params['l1_ratio']
        var alpha = this.params['alpha']
        var learning_rate = this.params['eta0']
        var epochs = this.params['max_iter']
        var batch_size = this.params['batch_size']

        var sample_shape = X.shape.slice(1)
        
        var l1_alpha = l1_ratio*alpha
        var l2_alpha = (1.0 - l1_ratio)*alpha
        var regularization = tf.regularizers.l1l2({
            'l1': l1_alpha,
            'l2': l2_alpha
        })

        var model = tf.sequential()
        model.add(tf.layers.dense({
            units: 1, 
            inputShape: sample_shape, 
            biasRegularizer: regularization, 
            kernelRegularizer: regularization
        }))
        
        await model.compile({
            loss: "meanSquaredError", 
            optimizer: tf.train.sgd(learning_rate)
        });

        await model.fit(X, y, {'epochs': epochs, 'batchSize': batch_size})
        var dense = model.layers[0]
        var coef_ = await dense.kernel.val.data()
        var intercept_ = await dense.bias.val.data()

        this.state['coef_'] = coef_
        this.state['intercept_'] = intercept_
        this.state['model'] = model
    }

    async predict(X){
        utils.check_is_fitted(this, ['model'])
        var X = utils.check_2dX(X)

        var model = this.state['model']
        var y_pred = await model.predict(X)

        // drop an extra dimension
        y_pred = tf.reshape(y_pred, [-1])
        return y_pred
    }
}

module.exports.SGDRegressor = SGDRegressor*/

class SGDRegressor extends RegressorMixin(BaseEstimator){
    /**
     * Learns linear regressor model using Stochastic Gradient Descent
     * to fit the model to the data.
     * @param {Object} params Parameters of the estimator.
     * @param {Number} [params.alpha] Multiplier of the regularization
     * term in the objective of SGD.
     * @param {Number} [params.l1_ratio] Fraction of L1 regularization
     * in sum of L1 and L2 regularizations.
     * @param {Number} [params.max_iter] Maximum number of iterations
     * for which to train the model.
     * @param {Number} [params.eta0] Learning rate for the algorithm.
     * @param {String} [params.penalty] Type of penalty to use. Supported
     * - 'elasticnet': both L1 and L2 penalty are used; Ratio between the
     * two losses is specified using `l1_ratio` parameter.
     * @param {String} [params.loss] Loss to use during training. Supported
     * losses are:
     * - 'squared_loss': squared error, l(y, f) = 1/n \sum_{i = 1..n}(y_i - f_i)^2
     * This loss is often used for regression problems.
     * - 'hinge': Hinge loss, l(y, f) = 1/n \sum_{i = 1..n} max(0, 1 - y_i * f_i)
     * This loss assumes that y_i \in {-1, 1}. Most of the time this loss is used
     * for classification problems.
     */
    constructor(params){
        super(params, {
            'alpha': 0.0001,
            'l1_ratio': 0.15,
            'max_iter': 250,
            'eta0': 0.1,
            'penalty': 'elasticnet',
            'loss': 'squared_loss'
        })
    }

    epoch(X, y, n_epoch){
        var N = y.length
        var M = X[0].length
        var l1_alpha = this.params['alpha'] * this.params['l1_ratio']
        var l2_alpha = this.params['alpha'] * (1.0 - this.params['l1_ratio'])
        var beta1p = this.state['beta1p']
        var beta2p = this.state['beta2p']
        var w = this.state['coef_']
        var b = this.state['intercept_']
        var m0 = this.state['m0']
        var v0 = this.state['v0']
        var f = this.state['f']
        var t = this.state['t']

        var loss_idx = {'squared_loss':0, 'hinge':1}[this.params['loss']]
        
        var beta1 = 0.9
        var beta2 = 0.999
        var lr = this.params['eta0'] / Math.pow(n_epoch, 0.5)

        var f_x = 0.0
        var dw_j = 0.0
        var w_j = 0.0
        var x = null
        var x_j = 0.0
        var error = 0
        var m_th=0.0
        var v_th = 0.0

        var aux0 = 0.0
        var aux1 = 0.0
        var aux2 = 0.0

        var y_i = 0.0
        
        for(var i=0; i<N; i++){
            t = t+1

            x = X[i]
            y_i = y[i]

            // loss
            f_x = 0.0
            for(var j=0; j<M; j++){
                f[j] = w[j] * x[j]
                f_x += f[j]
            }
            f_x += b
            // error = y[i] - f_x

            // dw_i (y - (xTw+b))**2 = -2*(y - (xTw+b)) * x_i
            // update the weights
            for(var j=0; j<M+1; j++){
                w_j = j<M? w[j] : b
                x_j = j<M? x[j] : 1.0
                
                // loss term
                dw_j = 0.0
                
                if(loss_idx === 0){
                    dw_j = -2*(y_i - f_x)*x_j
                }else if(loss_idx === 1){
                    dw_j = 1 - y_i*f_x
                    dw_j = dw_j > 0.0 ? dw_j : 0.0
                    dw_j = -y_i * x_j * dw_j
                }

                // regularization term
                dw_j += 2*w_j*l2_alpha + (w_j > 0.0? 1.0 : (w_j < 0.0? -1.0 : 0.0))*l1_alpha

                // SGD with momentum
                /**/
                m0[j] = beta1 * m0[j] + (1 - beta1) * dw_j
                beta1p = beta1p * beta1
                m_th = m0[j] / (1.0 - beta1p)
                w_j = w_j - lr * m0[j]
                

                // ADAM
                /*
                m0[j] = beta1 * m0[j] + (1 - beta1) * dw_j // Update biased first moment estimate
                v0[j] = beta2 * v0[j] + (1 - beta2) * dw_j * dw_j // Update biased second raw moment estimate
                beta1p = beta1p * beta1
                m_th = m0[j] / (1.0 - beta1p) // Compute bias-corrected first moment estimate
                beta2p = beta2p * beta2
                v_th = v0[j] / (1.0 - beta2p) // Compute bias-corrected second raw moment estimate
                w_j = w_j - lr * m_th / (Math.sqrt(v_th) + 1e-8)
                */

                // ADAMAX
                /*
                m0[j] = beta1 * m0[j] + (1 - beta1) * dw_j // Update biased first moment estimate
                aux0 = dw_j > 0? dw_j : -dw_j
                aux1 = beta2 * v0[j]                
                v0[j] = aux0 > aux1? aux0 : aux1 // Update the exponentially weighted infinity norm
                beta1p = beta1p * beta1
                w_j = w_j - (lr / (1.0 - beta1p)) * (m0[j] / (v0[j] + 1e-8))
                 */

                if(j<M){
                    w[j] = w_j
                    //error += f[j]
                    //error -= w_j * x_j
                }else{
                    b = w_j
                }
            }
            
        }

        // need only to store back constants
        this.state['intercept_'] = b
        this.state['t'] = t

        this.state['beta1p'] = beta1p
        this.state['beta2p'] = beta2p
    }

    preprocess_X(X){
        if(!('scale_' in this.state)){
            var mean_ = []
            for(var v of X[0]){
                mean_.push(0.0)
            }

            for(var j=0; j<X.length; j++){
                var x = X[j]
                for(var i=0; i<x.length; i++){
                    mean_[i] += x[i]
                }
            }

            for(var i=0; i<mean_.length; i++){
                mean_[i] /= X.length
            }

            // calculate variance
            var scale_ = []
            for(var v of X[0]){
                scale_.push(0.0)
            }

            var diff = 0
            for(var j=0; j<X.length; j++){
                var x = X[j]
                for(var i=0; i<x.length; i++){
                    diff = x[i] - mean_[i]
                    diff = diff*diff
                    scale_[i] += diff
                }
            }

            for(var i=0; i<scale_.length; i++){
                scale_[i] /= X.length
                scale_[i] = Math.sqrt(scale_[i])
            }

            this.state['scale_'] = scale_
            this.state['mean_'] = mean_
        }

        var scale_ = this.state['scale_']
        var mean_ = this.state['mean_']

        // apply normalization
        var X_new = []
        for(var x of X){
            var x_new = []
            for(var i=0; i<x.length; i++){
                x_new.push((x[i] - mean_[i]) / scale_[i])
            }
            X_new.push(x_new)
        }
        return X_new
    }

    normalize(y){
        // no need to normalize for hinge
        if(this.params['loss'] === 'hinge'){
            return y
        }
        var y_std = this.state['y_std']
        var y_mean = this.state['y_mean']
        var y_new = []
        for(var i=0; i<y.length; i++){
            y_new.push((y[i] - y_mean)/y_std)
        }
        return y_new
    }
    
    unnormalize(y){
        // no need to unnormalize for hinge
        if(this.params['loss'] === 'hinge'){
            return y
        }
        var y_std = this.state['y_std']
        var y_mean = this.state['y_mean']
        var y_new = []
        for(var i=0; i<y.length; i++){
            y_new.push(y[i]*y_std + y_mean)
        }
        return y_new
    }

    async fit(X, y){
        var [X, y] = utils.check_2dXy(X, y, false)
        X = this.preprocess_X(X)
        
        var N = X.length
        var max_iter = this.params['max_iter']

        this.state['coef_'] = await tf.zeros([X[0].length]).data()
        this.state['intercept_'] = (await tf.zeros([1]).data())[0]
        this.state['beta1p'] = 1.0
        this.state['beta2p'] = 1.0
        this.state['m0'] = await tf.zeros([X[0].length+1]).data()
        this.state['v0'] = await tf.zeros([X[0].length+1]).data()
        this.state['f'] = await tf.zeros([X[0].length+1]).data()
        this.state['t'] = 0
        
        
        // calculate the mean and standard deviation of y
        var y_mean = 0.0
        for(var i=0; i<y.length; i++){
            y_mean += y[i]
        }
        y_mean = y_mean / N
        var y_std = 0.0
        var diff = 0.0
        for(var i=0; i<y.length; i++){
            diff = (y[i] - y_mean)
            y_std += diff*diff
        }
        y_std = Math.sqrt(y_std / (N - 1)) 

        this.state['y_mean'] = y_mean
        this.state['y_std'] = y_std
        
        // normalize the y
        var y_new = this.normalize(y)

        for(var t=1; t<max_iter+1; t++){
            this.epoch(X, y_new, t)
        }
        return this
    }

    async predict(X){
        utils.check_is_fitted(this, ['coef_'])
        var X = utils.check_2dX(X, false)
        X = this.preprocess_X(X)

        var w = this.state['coef_']
        var b = this.state['intercept_']

        var N = X.length
        var M = X[0].length

        var results = []
        for(var x of X){
            var y = 0.0
            for(var i=0; i<M; i++){
                y+=w[i]*x[i]
            }
            y+= b
            results.push(y)
        }

        results = this.unnormalize(results)
        return results
    }

    /**
     * Converts a linear model to format that can be visualized using
     * http://tabulator.info/.
     * @param {Array} features Array of dictionaries, which contain information
     * on names of the features and type of the features. Every element in
     * the array should contain the following information:
     * name - name of the features
     * type - type of the feature, boolean or number
     */
    to_tabulator(features=null){
        utils.check_is_fitted(this, ['coef_'])
        var coef_ = this.state['coef_']

        // set the default values of features
        if(features === null){
            features = []
            for(var i=0; i<coef_.length; i++){
                features.push({
                    'name': "Feature #" + (i+0),
                    'type': 'number'
                })
            }
        }

        var contents = []

        for(var i=0; i<coef_.length; i++){
            contents.push({
                id: (i+1),
                feature: features[i]['name'],
                position: (i+1),
                weight: coef_[i]
            })
        }

        var fields =[ 
            {title: 'Feature', field: 'feature'},
            {title: 'Position', field: 'position'},
            {title: 'Weight', field: 'weight'}
        ]
        
        return [contents, fields]
    }
}

module.exports.SGDRegressor = SGDRegressor

class SGDClassifier extends base.ClassifierMixin(BaseEstimator){
    constructor(params){
        super(params, {
            'alpha': 0.0001,
            'l1_ratio': 0.15,
            'max_iter': 250,
            'eta0': 0.001,
            'penalty': 'elasticnet',
            'loss': 'hinge'
        })
    }

    async fit(X, y){
        var [X, y] = utils.check_2dXy(X, y, false)
        var binarizer = new prep.LabelBinarizer()
        binarizer.fit(y)
        var y = binarizer.transform(y).mul(2).add(-1)

        var n_models = y.shape[1] //=== 2? 1: y[0].length

        var models = []
        for(var yi=0; yi<n_models; yi++){
            var y_model = y.slice([0, yi], [y.shape[0], 1])
            y_model = Array.from(await y_model.data())
            var model = new SGDRegressor(this.params)
            await model.fit(X, y_model)
            models.push(model)
        }

        this.state['models'] = models
        this.state['binarizer'] = binarizer
        return this
    }

    async predict(X){
        utils.check_is_fitted(this, ['models', 'binarizer'])
        var X = utils.check_2dX(X, false)

        var y_models = []
        for(var model of this.state['models']){
            y_models.push(await model.predict(X))
        }

        var y_pred = []
        var inverse = this.state['binarizer'].state['inverse']

        for(var i=0; i<X.length; i++){
            var max_score = Number.NEGATIVE_INFINITY;
            var max_j = 0
            for(var j=0; j<y_models.length; j++){
                if(y_models[j][i] > max_score){
                    max_score = y_models[j][i]
                    max_j = j
                }
            }
            y_pred.push(inverse[max_j])
        }

        return y_pred
    }

}

module.exports.SGDClassifier = SGDClassifier