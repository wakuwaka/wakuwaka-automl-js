const tf = require('@tensorflow/tfjs');
const base64js = require('base64-js')
const opt = require('optimization-js'
)
const base_estimators = {}

// supported serializable classes
const prep = require('./preprocessing')
base_estimators['TableFeaturesTransformer'] = prep.TableFeaturesTransformer
base_estimators['StandardScaler'] = prep.StandardScaler
base_estimators['LabelBinarizer'] = prep.LabelBinarizer

const tree = require('./tree')
base_estimators['DecisionTreeClassifier'] = tree.DecisionTreeClassifier
base_estimators['DecisionTreeRegressor'] = tree.DecisionTreeRegressor

const nn = require('./nn')
base_estimators['MLPRegressor'] = nn.MLPRegressor
base_estimators['MLPClassifier'] = nn.MLPClassifier

const linear_model = require('./linear_model')
base_estimators['SGDRegressor'] = linear_model.SGDRegressor
base_estimators['SGDClassifier'] = linear_model.SGDClassifier

const ensemble = require('./ensemble')
base_estimators['GradientBoostingRegressor'] = ensemble.GradientBoostingRegressor
base_estimators['GradientBoostingClassifier'] = ensemble.GradientBoostingClassifier

const model_selection = require('./model_selection')
base_estimators['OMGSearchCV'] = model_selection.OMGSearchCV

module.exports.base_estimators = base_estimators

// supported numerical array types for serialization
const js_array_types = {
    'Float32Array': Float32Array,
    'Float64Array': Float64Array,
    'Int8Array': Int8Array,
    'Int16Array': Int16Array,
    'Int32Array': Int32Array,
    'Uint8Array': Uint8Array,
    'Uint16Array': Uint16Array,
    'Uint32Array': Uint32Array
}

// supported optimization-js classes
const opt_js_types = {
    'Real': opt.Real,
    'Integer': opt.Integer,
    'Categorical': opt.Categorical
}

/**
 * Convert various objects to json format. Is useful for
 * serialization and deserialization of aitable objects.
 * @param {Any} obj Instance of an object to be converted
 * into a serializable json. Can be a json serializable
 * value, a class that can be serialized, or instance
 * of tensorflowjs objects.
 */
async function dumpjson(obj){
    var type = typeof obj

    if(['number', 'string', 'boolean'].includes(type) || obj === null){
        // native type, serializable
        return {
            'type': 'native',
            'value': obj
        }
    }else if(type === 'object'){
        // get class name of the object
        var cname = obj.constructor.name

        // list type
        if(cname === 'Array'){
            var serialized = []
            for(var value of obj){
                var out = await dumpjson(value)
                serialized.push(out)
            }
            return {
                'type': 'list',
                'value': serialized
            }
        }else if(cname === 'Object'){ // assumes the case of dictionary
            var serialized = [] // list of pairs of key, value
            for(var key in obj){
                serialized.push([
                    await dumpjson(key), await dumpjson(obj[key])
                ])
            }
            return {
                'type': 'dict',
                'value': serialized
            }
        }else if(cname === 'Tensor'){
            var data = await obj.data()
            var shape = obj.shape
            var dtype = obj.dtype

            return {
                'type': 'tf_tensor',
                'value': {
                    'data': await dumpjson(data),
                    'shape': shape,
                    'dtype': dtype
                }
            }
        }else if(cname === 'Sequential'){  // convert tf model
            var results = []

            var handleSave = function (artifacts){
                results.push(artifacts.modelTopology)
                results.push(artifacts.weightSpecs)
                results.push(artifacts.weightData)
            }

            await obj.save(tf.io.withSaveHandler(handleSave));

            var value = {
                modelTopology: results[0],
                weightSpecs: results[1],
                weightData: await dumpjson(new Uint8Array(results[2]))
            }  
            
            return {
                'type': 'tf_model',
                'value': value
            }
        }else if(cname in opt_js_types){
            var value = {
                'class':cname
            }
            if(cn