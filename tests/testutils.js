const tf = require('@tensorflow/tfjs');
const io = require('../src/io')
const expect = require('chai').expect;

/**
 * Tests if the function with no arguments raises
 * an exception.
 * @param {function} fnc Function that contains some
 * functionality that is supposed to raise exception
 */
async function except(fnc){
    var raises = false
    try{
        await fnc()
    }catch(ex){
        raises = true
    }
    expect(raises).to.be.eq(true)
}

module.exports.except = except

/**
 * Test whether the object can be serialized and deserialized.
 * @param {Any} value object to be tested for serialization
 */
async function roundtrip_test(value){
    var clone = await io.clone(value, true)
    
    // check if types match
    expect(typeof value).deep.equal(typeof clone)

    if(typeof value === 'object' && value !== null){
        // expect class name to deeply equal
        var c1name = value.constructor.name
        var c2name = clone.constructor.name
        expect(c1name).to.be.equal(c2name)

        // 