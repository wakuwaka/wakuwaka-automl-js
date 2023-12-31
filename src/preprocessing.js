
const tf = require('@tensorflow/tfjs');
const utils = require('./utils')

/**
 * Converts a set of inputs, represented as
 * matrix X with columns corresponding to the
 * different features, into a numeric matrix X'.
 * Can handle missing values and categorical 
 * columns. The type of column is detected 
 * automatically.
 */
class TableFeaturesTransformer{
    constructor(params){
        this.params = utils.set_defaults(params)
        this.state = null
    }

    /**
     * Determine if the column is numeric, categorical, or other.
     * @param {Array} C 1d array of values, represents single column.
     * @returns {String} Type of the output. Could be either 'category'
     * or 'number'.
     */
    column_type(C){
        var feature = {'type': 'skip'}
        var n_rows = C.length

        // check if values are numerical or categorical
        var is_num = true

        for(var j=0; j<n_rows; j++){
            var x = C[j]
            
            // missing value, skip it
            if(x == ''){  
                continue
            }

            // check if the value can be converted to float
            if(isNaN(Number(x))){
                is_num = false  // if not - it is not a numeric value
                break
            }
        }

        if(is_num){

            // calculate the mean of values in column
            var sum = 0.0
            var N = 0

            for(var j=0; j<n_rows; j++){
                var x = C[j]
                if(x == ''){  
                    continue
                }
                sum += Number(x)
                N += 1
            }

            var mean = sum / N

            // used for imputation
            feature['type'] = 'number'
            feature['mean'] = mean
        }else{

            var cats = {} // all possible categories
            var cats_l = []
            var cat_index = 0

            for(var j=0; j<n_rows; j++){
                var x = C[j]

                if(x in cats){
                    continue
                }

                cats[x] = true
                cats_l.push(x)
            }

            // ensure that categories are in sorted order
            cats_l.sort()

            for(var j=0; j<cats_l.length; j++){
                cats[cats_l[j]] = j
            }

            feature['categories'] = cats
            feature['n_classes'] = cats_l.length
            feature['type'] = 'category'
        }

        return feature
    }

    /**
     * Select a single column of matrix X.
     * @param {Array} X nested array, represents matrix of raw inputs.
     * @param {Integer} i Index of the column to select
     */
    get_column(X, i){
        var C = []
        for(var j=0; j<X.length; j++){
            C.push(X[j][i])
        }
        return C
    }

    /**
     * Determines the type of columns, and calculates all the necessary
     * parameters for imputation of missing values and conversion of 
     * categorical values, if any.
     * @param {Array} X Matrix of raw inputs, where columns correspond
     * to different features.
     * @param {Array} y A vector of outputs. A type of problem could be
     * determined from the type of the output.
     * @param {Array} feature_names An array that contains names of the
     * features as strings.
     */
    fit(X, y, feature_names=null){
        var features = {}

        this.state = {
            'features': features
        }
        
        var n_cols = X[0].length

        for(var i=0; i<n_cols; i++){
            var C = this.get_column(X, i)
            features[i] = this.column_type(C)
        }

        this.state['output'] = this.column_type(y)

        if(feature_names !== null){
            var feature_params = []
            for(var j=0; j<X[0].length; j++){
                var f = features[j]
                if(f['type'] == 'number'){
                    feature_params.push({
                        name: feature_names[j],
                        type: 'number'
                    })
                }else{
                    var cats = f['categories']
                    var ivcats = {}
                    var N_cats = 0
                    // make format: {1: 'feat_a', 2: 'feat_b', ...}
                    for(var c in cats){
                        ivcats[cats[c]] = c
                        N_cats++
                    }
                    
                    for(var i=0; i<N_cats; i++){
                        feature_params.push({
                            name: feature_names[j] + "==" + ivcats[i],
                            type: 'boolean'
                        })
                    }
                }
            }

            this.state['feature_params'] = feature_params
        }
        

        return this
    }

    /**
     * Convert some inputs to purely numerical features, suitable for 
     * further use in ML pipelines. 
     * @param {Array} X Matrix of raw inputs. These should be of the same
     * format as the inputs used to `fit` method.
     * @param {Array} y Vector of raw inputs. 
     */
    transform(X, y=null){
        var X_feat = []
        var features = this.state['features']

        // for every sample ...
        for(var i=0; i<X.length; i++){
            var row = X[i]
            var x_feat = []

            // for every column in sample ...
            for(var j=0; j<row.length; j++){
                var feature = features[j]
                var xv = row[j]

                if(feature['type'] == 'number'){
                    var x_num = Number(xv)

                    // do imputation if number is not convertable or missing
                    if(isNaN(x_num) || (xv === '')){
                        x_feat.push(feature['mean'])
                        continue
                    }
                    x_feat.push(x_num)
                }else{
                    // do the one hot encoding of categorical data
                    var cats = feature['categories']
                    var ix = cats[xv]
                    for(var cat_ix =0; cat_ix<feature['n_classes']; cat_ix++){
                        x_feat.push(cat_ix == ix? 1.0 : 0.0)
                    }
                }

            }
            X_feat.push(x_feat)
        }

        return X_feat
    }
}

module.exports.TableFeaturesTransformer = TableFeaturesTransformer

/**
 * Standardize features by removing the mean and scaling to unit variance.
 */
class StandardScaler{
    constructor(params){
        this.params = utils.set_defaults(params)
        this.state = {}
    }

    /**
     * Compute the mean and variance to be used for later scaling.
     * @param {Array} X array-like, shape [n_samples, n_features]
     *     The data used to compute the mean and standard deviation
     *     used for later scaling along the features axis.
     * @param {Array} y Passthrough for ``Pipeline`` compatibility.
     */
    fit(X, y=null){
        var X = utils.t2d(X)

        var mean = tf.mean(X, 0)

        // calculate scaler similar to how sklearn does it - sq.root of variance
        var variance = tf.mean(tf.pow(tf.abs(tf.sub(X, mean)),2), 0)
        var scale = tf.sqrt(variance)
        
        // naming similar to sklearn
        this.state['mean_'] = mean
        this.state['scale_'] = scale

        // sklearn convention
        return this
    }

    /**
     * Perform standardization by centering and scaling values of 
     * the features.
     * @param {Array} X array-like, shape [n_samples, n_features]
     *    The data used to scale along the features axis.
     * @param {Array} y ignored
     */
    transform(X, y=null){
        var X = utils.t2d(X)

        var mean = this.state['mean_']
        var scale = this.state['scale_']

        var Xn = tf.div(tf.sub(X, mean), scale)
        return Xn
    }
}

module.exports.StandardScaler = StandardScaler

/**
 * Convert labels to one hot encoded representation.
 */
class LabelBinarizer {
    constructor(params){
        this.params = utils.set_defaults(params)
        this.state = null
    }

    fit(y){
        var seen = {} // all possible categories
        var categories_list = []
        
        for(var j=0; j<y.length; j++){
            var x = y[j]

            if(x in seen){
                continue
            }

            seen[x] = true
            categories_list.push(x)
        }

        // ensure that categories are in sorted order
        categories_list.sort()

        var categories = {}
        var inversecat = {}

        for(var j=0; j<categories_list.length; j++){
            categories[categories_list[j]] = j
            inversecat[j] = categories_list[j]
        }

        this.state = {
            'categories': categories,
            'inverse': inversecat,
            'n_classes': categories_list.length
        }

        return this
    }

    transform(y){
        var y_new = []
        var categories = this.state['categories']

        for(var yv of y){
            var y_feat = []
            var ix = categories[yv]
            for(var cat_ix=0; cat_ix<this.state['n_classes']; cat_ix++){
                y_feat.push(cat_ix == ix? 1.0 : 0.0)
            }
            y_new.push(y_feat)
        }

        y_new = utils.t2d(y_new)        
        return y_new
    }

    inverse_transform(y){
        var categories_inverse = this.state['inverse']

        var I = tf.argMax(y, 1)
        I = I.dataSync()

        var y_new = []
        for(var i of I){
            y_new.push(categories_inverse[i])
        }
        return y_new
    }
}

module.exports.LabelBinarizer = LabelBinarizer