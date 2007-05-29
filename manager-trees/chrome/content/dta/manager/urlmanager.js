function UrlManager(urls) {
	this._urls = [];
	this._idx = 0;

	if (urls instanceof Array) {
		this.initByArray(urls);
	}
	else if (urls) {
		throw "Feeding the URLManager with some bad stuff is usually a bad idea!";
	}
}
UrlManager.prototype = {
	_sort: function(a,b) {
		const rv = a.preference - b.preference;
		return rv ? rv : (a.url < b.url ? -1 : 1);
	},
	initByArray: function um_initByArray(urls) {
		for (var i = 0; i < urls.length; ++i) {
			this.add(
				new DTA_URL(
					urls[i].url,
					urls[i].charset,
					urls[i].usable,
					urls[i].preference
				)
			);
		}
		this._urls.sort(this._sort);
		this._usable = this._urls[0].usable;
	},
	add: function um_add(url) {
		if (!url instanceof DTA_URL) {
			throw (url + " is not an DTA_URL");
		}
		if (!this._urls.some(function(ref) { return ref.url == url.url; })) {
			this._urls.push(url);
		}
	},
	getURL: function um_getURL(idx) {
		if (typeof(idx) != 'number') {
			this._idx--;
			if (this._idx < 0) {
				this._idx = this._urls.length - 1;
			}
			idx = this._idx;
		}
		return this._urls[idx];
	},
	get url() {
		return this._urls[0].url;
	},
	get usable() {
		return this._urls[0].usable;
	},
	get charset() {
		return this._urls[0].charset;
	},
	replace: function um_replace(url, newUrl) {
		this._urls.forEach(function(u,i,a){ if (u.url == url) u = newURL; });
	},
	save: function um_save() {
		var rv = [];
		for (var i = 0, e = this._urls.length; i < e; ++i) {
			var c = {};
			c.url = this._urls[i].url;
			c.charset = this._urls[i].charset;
			c.usable = this._urls[i].usable;
			c.preference = this._urls[i].preference;
			rv.push(c);
		}
		return rv;
	}
};