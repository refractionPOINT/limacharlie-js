const uuid = require("uuid4")

class Sensor {
  constructor(manager, sid) {
    this._man = manager
    this.sid = sid
    this._invId = null
    this._info = null
  }

  setInvId(invId) {
    this._invId = invId
  }

  async task(tasks, invId, isThrowError) {
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
    return await this._man._apiCall(this.sid, "POST", req, false, isThrowError)
  }

  async request(tasks, responseCb, onError) {
    if(!this._man._isInteractive) {
      throw new Error("Manager provided was not created with isInteractive set to true, cannot track responses.")
    }
    let trackingId = `${this._man._invId}/${uuid()}`
    this._man._spout.registerSpecificCallback(trackingId, 60, (data) => {
      responseCb(data)
    })
    if(onError) {
      try {
        return await this.task(tasks, trackingId, true)
      } catch(e) {
        onError(e)
      }
    }
    return await this.task(tasks, trackingId)
  }

  asAid() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return `${this._info.oid}.${this._info.iid}.${this._info.sid}.${this._info.plat.toString(16)}.${this._info.arch}`
  }

  isWindows() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x10000000
  }

  isLinux() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x20000000
  }

  isMac() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x30000000
  }

  isAndroid() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.plat === 0x50000000
  }

  isChrome() {
    if(!this._info) {
      this.getInfo()
      return null
    }
    return this._info.arch === 0x00000006
  }

  async hostname() {
    if(!this._info) {
      await this.getInfo()
    }
    return this._info.hostname
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
    this._info = data.info
    return data.info
  }

  async isOnline() {
    const data = await this._man._apiCall(this.sid, "GET")
    return (data && data.online && !("error" in data.online)) ? true : false
  }

  async getHistoricEvents(params) {
    params["is_compressed"] = "true"
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}`, "GET", params)
    data.events = await this._man._unzip(Buffer.from(data.events, "base64"))
    data.events = JSON.parse(data.events)
    return data
  }

  async getSpecificEvent(atom, before) {
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}/${atom}`, "GET", {
      before: before,
    }, false, false, 30 * 1000)
    return data
  }

  async getHistoricOverview(params) {
    let data = await this._man._apiCall(`insight/${this._man._oid}/${this.sid}/overview`, "GET", params)
    return data.overview
  }

  async getTrafficStats(start, end) {
    return await this._man.getTrafficStats(start, end, this.sid)
  }
}

module.exports = Sensor
