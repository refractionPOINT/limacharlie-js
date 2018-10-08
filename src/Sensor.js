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
}

module.exports = Sensor