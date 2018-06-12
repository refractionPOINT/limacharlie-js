const expect = require('chai').expect
const Manager = require('../Manager')
const Spout = require('../Spout')
const Webhook = require('../Webhook')

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
        }, error => {
            console.error(error)
        },
        null,   // Investigation ID
        null,   // Sensor Tag
        null)   // Detect Category
        
        await sleep(31)

        expect(feedData).to.not.have.lengthOf(0)

        spout.shutdown()

        await sleep(5)
        feedData = []
        await sleep(5)

        expect(feedData).to.have.lengthOf(0)
    })
})

describe('Webhook()', function() {
    this.timeout(1000)
    it('should validate webhooks', () => {
        let sampleData = '{"source": "5f6a41e7-49de-4fb0-9abb-b759e1613f9f.cef26d65-66ec-412c-a177-7ef631e08ebd.372390f9-e7a2-47bd-86ef-6549756d52e2.20000000.2", "detect": {"routing": {"hostname": "lc-1", "event_type": "STARTING_UP", "event_time": 1528755862361, "tags": ["test_tag_fd573ea7-1e00-41a1-b6d3-769800e93a42"], "event_id": "182a4785-b2cb-467f-8c6b-5c68c8bda609", "oid": "5f6a41e7-49de-4fb0-9abb-b759e1613f9f", "iid": "cef26d65-66ec-412c-a177-7ef631e08ebd", "plat": 536870912, "ext_ip": "127.0.0.1", "sid": "372390f9-e7a2-47bd-86ef-6549756d52e2", "int_ip": "172.16.223.219", "arch": 2, "moduleid": 2}, "event": {}}, "routing": {"hostname": "lc-1", "event_type": "STARTING_UP", "event_time": 1528755862361, "tags": ["test_tag_fd573ea7-1e00-41a1-b6d3-769800e93a42"], "event_id": "182a4785-b2cb-467f-8c6b-5c68c8bda609", "oid": "5f6a41e7-49de-4fb0-9abb-b759e1613f9f", "iid": "cef26d65-66ec-412c-a177-7ef631e08ebd", "plat": 536870912, "ext_ip": "127.0.0.1", "sid": "372390f9-e7a2-47bd-86ef-6549756d52e2", "int_ip": "172.16.223.219", "arch": 2, "moduleid": 2}, "detect_id": "9b856545-d762-438e-9771-e1a3eb04b66f", "cat": "test_detect"}'
        let actualKey = '123'
        let goodSig = '3c046f332bb41e5c29a333847341276e688cd41c2c323f897e02c087daa09dcf'
        let badSig = '4c046f332bb41e5c29a333847341276e688cd41c2c323f897e02c087daa09dcd'

        let wh = new Webhook(actualKey)
        expect(wh.isSignatureValid(sampleData, goodSig)).to.be.true
        expect(wh.isSignatureValid(sampleData, badSig)).to.be.false
    })
})