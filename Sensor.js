
class Sensor {
    constructor(manager, sid) {
        this._man = manager
        this.sid = sid
        this._invId
    }

    setInvId(invId) {
        this._invId
    }

    task(tasks, invId) {
        if(!Array.isArray(tasks)) {
            tasks = [tasks]
        }
        let req = {
            tasks: tasks,
        }
        let thisInv = invId
        if(!thisInv) {
            thisInv = this._invId
        }
        if(thisInv) {
            req['investigation_id'] = thisInv
        }
        return this._man._apiCall(this.sid, 'POST', req)
    }

    tag(tag, ttl) {
        return this._man._apiCall(`${this.sid}/tags`, 'POST', {
            tags: tag,
            ttl: ttl
        })
    }

    untag(tag) {
        return this._man._apiCall(`${this.sid}/tags`, 'DELETE', {
            tag: tag,
        })
    }

    async getTags() {
        const data = await this._man._apiCall(`${this.sid}/tags`, 'GET')
        return Object.keys(data.tags[this.sid])
    }

    async getInfo() {
        const data = await this._man._apiCall(this.sid, 'GET')
        return data.info
    }
}

module.exports = Sensor
