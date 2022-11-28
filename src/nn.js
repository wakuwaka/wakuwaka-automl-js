const utils = require('./utils')
const prep = require('./preprocessing')
const metrics = require('./metrics')
const tf = require('@tensorflow/tfjs')
const base = require('./base')

class MLPBase extends base.BaseEstimator{
    constructor(params){
        super(params, {
            'n_neurons': 32,
            'lr': 1e-4,
            'epochs': 100,
            'batch_size': 128
        })
        // to be specified by child classes
        this.outputs = 1
        this.loss = 'meanSquaredError'
        this.final_layer_activation = '