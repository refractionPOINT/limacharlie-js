const request = require("request-promise")

class Payloads {
  constructor(manager) {
    this._man = manager
  }

  async list() {
    let data = await this._man._apiCall(`payload/${this._man._oid}`, "GET", {})
    return data
  }

  async get(name) {
    let data = await this._man._apiCall(`payload/${this._man._oid}/${name}`, "GET", {})
    let url = data.get_url
    if(!url) {
      return null
    }
    let req = {
      method: "GET",
      timeout: 60 * 1000,
    }
    return request(`${url}`, req)
  }

  async create(name) {
    let data = await this._man._apiCall(`payload/${this._man._oid}/${name}`, "POST", {})
    return data.put_url
  }

  async delete(name) {
    let data = await this._man._apiCall(`payload/${this._man._oid}/${name}`, "DELETE", {})
    return data
  }
}

module.exports = Payloads