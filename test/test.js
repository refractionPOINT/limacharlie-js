const expect = require('chai').expect
const Manager = require('../Manager')
const Spout = require('../Spout')

const OID = ''
const API_KEY = ''

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

describe('Spout()', function () {
    this.timeout(62000)
    it('should create a Spout', async function () {
        console.log(Manager)
        var man = new Manager(OID, API_KEY)
        var spout = new Spout(man, 'event', console.log)
        await sleep(60000)
        expect(false)
        done()
    })
})