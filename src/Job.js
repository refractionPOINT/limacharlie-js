class Job {
  constructor(manager, data) {
    this._man = manager
    this.data = data
  }

  async reload(withData) {
    let data = await this._man._apiCall(`job/${this._man._oid}/${this.data.job_id}`, "GET", {
      is_compressed: "true",
      with_data: "" + !!withData,
    })
    data.job = await this._man._unzip(Buffer.from(data.job, "base64"))
    data.job = JSON.parse(data.job)
    this.data = data.job
  }

  async delete() {
    let data = await this._man._apiCall(`job/${this._man._oid}/${this.data.job_id}`, "DELETE")
    return data
  }
}

module.exports = Job