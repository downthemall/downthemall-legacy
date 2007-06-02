function Visitor() {
	// sanity check
	if (arguments.length != 1) {
		return;
	}

	var nodes = arguments[0];
	for (x in nodes) {
		if (!name || !(name in this.cmpKeys))	{
			continue;
		}
		this[x] = nodes[x];
	}
}

Visitor.prototype = {
	cmpKeys: {
		'etag': true, // must not be modified from 200 to 206: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2.7
		//'content-length': false,
		'content-type': true,
		'last-modified': true, // may get omitted later, but should not change
		'content-encoding': true // must not change, or download will become corrupt.
	},
	type: null,
	overrideCharset: null,
	encoding: null,
	fileName: null,
	acceptRanges: false,
	contentlength: 0,
	time: null,

	QueryInterface: function(aIID) {
		if (
			aIID.equals(Ci.nsISupports)
			|| aIID.equals(Ci.nsIHttpHeaderVisitor)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	visitHeader: function(aHeader, aValue) {
		try {
			const header = aHeader.toLowerCase();
			switch (header) {
				case 'content-type': {
					this.type = aValue;
					var ch = aValue.match(/charset=['"]?([\w\d_-]+)/i);
					if (ch && ch[1].length) {
						DTA_debug.dump("visitHeader: found override to " + ch[1]);
						this.overrideCharset = ch[1];
					}
				}
				break;

				case 'content-encoding':
					this.encoding = aValue;
				break;

				case 'accept-ranges':
					this.acceptRanges = aValue.toLowerCase().indexOf('none') == -1;
					Debug.dump("acceptrange = " + aValue.toLowerCase());
				break;

				case 'content-length':
					this.contentlength = Number(aValue);
				break;

				case 'content-range':
					// XXX?
					var dim = aValue.substring(aValue.lastIndexOf('/') + 1, aValue.length);
					if (dim.length>0 && dim.lastIndexOf('*')==-1) {
						this.contentlength = Number(dim);
					}
				break;
				case 'last-modified':
					try {
						this.time = Utils.getTimestamp(aValue);
					}
					catch (ex) {
						Debug.dump("gts", ex);
						// no-op
					}
				break;
			}
			if (header == 'etag') {
				// strip off the "inode"-part apache and others produce, as mirrors/caches usually provide wrong numbers here :p
				this[header] = aValue.replace(/^[a-f\d]+-([a-f\d]+)-([a-f\d]+)$/, '$1-$2');
			}
			else if (header in this.cmpKeys) {
				this[header] = aValue;
			}
			if ((header == 'content-type' || header == 'content-disposition') && this.fileName == null) {
				// we have to handle headers like "content-disposition: inline; filename='dummy.txt'; title='dummy.txt';"
				var value = aValue.match(/file(?:name)?=(["']?)([^\1;]+)\1(?:;.+)?/i);
				if (!value) {
					// workaround for bug #13959
					// attachments on some vbulletin forums send nasty headers like "content-disposition: inline; filename*=utf-8''file.ext"
					value = aValue.match(/file(?:name)?\*=(.*)''(.+)/i);
					if (value) {
						this.overrideCharset = value[1];
					}
				}
				if (value) {
					this.fileName = value[2].getUsableFileName();
					Debug.dump("found fn:" + this.fileName);
				}
			}
		} catch (ex) {
			Debug.dump("hrhv::visitHeader:", ex);
		}
	},
	compare: function vi_compare(v)	{
		if (!(v instanceof Visitor)) {
			return;
		}

		for (x in this.cmpKeys) {
			// we don't have this header
			if (!(x in this)) {
				continue;
			}
			// v does not have this header
			else if (!(x in v)) {
				// allowed to be missing?
				if (this.cmpKeys[x]) {
					continue;
				}
				Debug.dump(x + " missing");
				throw new Components.Exception(x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				Debug.dump(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw new Components.Exception("Header " + x + " doesn't match");
			}
		}
	},
	save: function vi_save(node) {
		var rv = {};
		// salva su file le informazioni sugli headers
		for (x in this.cmpKeys) {
			if (!(x in this)) {
				continue;
			}
			rv[x] = this[x];
		}
		return rv;
	}
};

/**
 * Visitor Manager c'tor
 * @author Nils
 */
function VisitorManager() {
	this._visitors = {};
}
VisitorManager.prototype = {
	/**
	 * Loads a ::save'd JS Array
	 * Will silently bypass failed items!
	 * @author Nils
	 */
	load: function vm_init(nodes) {
		for (var i = 0; i < nodes.length; ++i) {
			try {
				this._visitors[nodes[i].url] = new Visitor(nodes[i].values);
			} catch (ex) {
				Debug.dump("failed to read one visitor", ex);
			}
		}
	},
	/**
	 * Saves/serializes the Manager and associated Visitors to an JS Array
	 * @return A ::load compatible Array
	 * @author Nils
	 */
	save: function vm_save() {
		var rv = [];
		for (x in this._visitors) {
			var v = {};
			v.url = x;
			v.values = this._visitors[x].save();
			rv.push(v);
		}
		return rv;
	},
	/**
	 * Visit and compare a channel
	 * @returns visitor for channel
	 * @throws Exception if comparision yield a difference (i.e. channels are not "compatible")
	 * @author Nils
	 */
	visit: function vm_visit(chan) {
		var url = chan.URI.spec;

		var visitor = new Visitor();
		chan.visitResponseHeaders(visitor);
		if (url in this._visitors)
		{
				this._visitors[url].compare(visitor);
		}
		return (this._visitors[url] = visitor);
	},
	/**
	 * return the first timestamp registered with a visitor
	 * @throws Exception if no timestamp found
	 * @author Nils
	 */
	get time() {
		for (i in this._visitors) {
			if (this._visitors[i].time > 0) {
				return this._visitors[i].time;
			}
		}
		throw new Components.Exception("No Date registered");
	}
};