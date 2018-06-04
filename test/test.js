const expect = require('chai').expect
const Manager = require('../Manager')
const Spout = require('../Spout')

const OID = ''
const API_KEY = ''

function sleep(s) {
    return new Promise(resolve => setTimeout(resolve, s * 1000))
}

describe('Manager()', function () {
    this.timeout(5000)
    it('should test auth', async () => {
        
        const man = new Manager(OID, API_KEY)
        const isAuthed = await man.testAuth()
        expect(isAuthed).to.be.true
    })
    it('should list sensors', async () => {
        
        const man = new Manager(OID, API_KEY)
        const sensors = await man.sensors()
        expect(sensors).to.not.have.lengthOf(0)
    })
})

describe('Sensor()', function() {
    this.timeout(30000)
    it('should get sensor info', async () => {
        
        const man = new Manager(OID, API_KEY)
        const sensors = await man.sensors()
        expect(sensors).to.not.have.lengthOf(0)
        const sensor = sensors[0]
        const info = await sensor.getInfo()
        expect(Object.keys(info)).to.not.have.lengthOf(0)
    })
    it('should update sensor tags', async () => {
        const testTag = '__test_tag'
        const man = new Manager(OID, API_KEY)
        const sensors = await man.sensors()
        expect(sensors).to.not.have.lengthOf(0)
        const sensor = sensors[0]
        const info = await sensor.getInfo()
        expect(Object.keys(info)).to.not.have.lengthOf(0)
        await sensor.tag(testTag, 30)
        sleep(2)
        let tags = await sensor.getTags()
        expect(tags).to.be.an('array').that.includes(testTag)
        await sensor.untag(testTag)
        sleep(2)
        tags = await sensor.getTags()
        expect(tags).to.be.an('array').that.does.not.include(testTag)
    })
    it('should task a sensor', async () => {
        
        const man = new Manager(OID, API_KEY)
        const sensors = await man.sensors()
        expect(sensors).to.not.have.lengthOf(0)
        const sensor = sensors[0]
        await sensor.task('dir_list / *')
    })
})

describe('Spout()', function() {
    this.timeout(90000)
    it('should get data from sensors', async () => {
        let feedData = []
        const man = new Manager(OID, API_KEY)
        const spout = new Spout(man, 'event', event => {
            feedData.push(event)
        })
        
        await sleep(31)

        expect(feedData).to.not.have.lengthOf(0)

        spout.shutdown()

        await sleep(5)
        feedData = []
        await sleep(5)

        expect(feedData).to.have.lengthOf(0)

        spout.resume()

        await sleep(31)

        expect(feedData).to.not.have.lengthOf(0)

        spout.shutdown()
    })
})