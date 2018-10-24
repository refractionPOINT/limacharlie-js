const zlib = require('zlib')
const uuid = require("uuid4")

class Sensor {
  constructor(manager, sid) {
    this._man = manager
    this.sid = sid
    this._invId = null
  }

  setInvId(invId) {
    this._invId = invId
  }
  
  async _unzip(data) {
    return new Promise(function(resolve, reject) {
      zlib.unzip(data, (err, buffer) => {
        if(err) {
          return reject(err)
        }
        resolve(buffer.toString())
      })
    })
  }

  async task(tasks, invId) {
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
      req["investigation_id"] = thisInv
    }
    return await this._man._apiCall(this.sid, "POST", req)
  }
  
  async request(tasks, responseCb) {
    if(!this._man._isInteractive) {
      throw new Error("Manager provided was not created with isInteractive set to true, cannot track responses.")
    }
    let trackingId = `${this._man._invId}/${uuid()}`
    this._man._spout.registerSpecificCallback(trackingId, 60, (data) => {
      responseCb(data)
    })
    return await this.task(tasks, trackingId)
  }

  async tag(tag, ttl) {
    return await this._man._apiCall(`${this.sid}/tags`, "POST", {
      tags: tag,
      ttl: ttl
    })
  }

  async untag(tag) {
    return await this._man._apiCall(`${this.sid}/tags`, "DELETE", {
      tag: tag,
    })
  }

  async getTags() {
    const data = await this._man._apiCall(`${this.sid}/tags`, "GET")
    return Object.keys(data.tags[this.sid])
  }

  async getInfo() {
    const data = await this._man._apiCall(this.sid, "GET")
    return data.info
  }

  async isOnline() {
    const data = await this._man._apiCall(this.sid, "GET")
    return (data.online && !("error" in data.online)) ? true : false
  }
  
  async getHistoricEvents(params) {
    params["is_compressed"] = "true"
    params["_timeout"] = "20"
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}`, "GET", params)
    data.events = await this._unzip(Buffer.from(data.events, 'base64'))
    data.events = JSON.parse(data.events)
    return data.events
  }
}

module.exports = Sensor
