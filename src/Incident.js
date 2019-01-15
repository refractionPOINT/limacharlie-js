class Incident {
  constructor(manager, data) {
    this._man = manager
    this.data = data
  }

  async setDefcon(defcon) {
    let data = await this._man._apiCall(`incident/${this._man._oid}/${this.data.incident_id}`, "POST", {
      defcon: defcon,
    })
    this.data.defcon = defcon
    await this.reload(this.data.record)
    return data
  }

  async reload(withData) {
    let data = await this._man._apiCall(`incident/${this._man._oid}/${this.data.incident_id}`, "GET", {
      is_compressed: "true",
      with_data: "" + !!withData,
    })
    data.incident = await this._man._unzip(Buffer.from(data.incident, "base64"))
    data.incident = JSON.parse(data.incident)
    this.data = data.incident
  }

  async delete() {
    let data = await this._man._apiCall(`incident/${this._man._oid}/${this.data.incident_id}`, "DELETE")
    return data
  }
}

module.exports = Incident