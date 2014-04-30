/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll Batch Generator module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ["BatchGenerator"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("resource://dta/utils.jsm");

/**
 * Simple literal
 * @param str (string) Literal
 */
function Literal(str) {
	this.str = str;
	this.first = this.last = this.str;
	this.length = 1;
}
Literal.prototype = {
	join: function(str) {
		yield str + this.str;
	},
	toString: function() {
		return this.str;
	}
};

/**
 * Abstract base class for Ranges (Numeric, Alpha, ...)
 */
function Range() {
};
Range.prototype = {
	init: function(name, start, stop, step) {
		stop += -Math.abs(step)/step;
		stop += step - ((stop - start) % step);
		
		this.name = name;
		this.start = start;
		this.stop = stop;
		this.step = step;
		this.length = Math.floor((stop - start) / step);
		this.first = this.format(this.start);
		this.last = this.format(this.stop - this.step);
	},
	join: function(str) {
		for (let i in range(this.start, this.stop, this.step)) {
			yield (str + this.format(i));
		}
	}
};

/**
 * Numeric range
 * @param name (string) Name (for any GUI representation)
 * @param start (int) Range start
 * @param stop (int) Range stop/end
 * @param step (int) Range step
 * @param strl (int) Minimal length of the numeric literals to produce
 */
function NumericRange(name, start, stop, step, strl) {
	this.strl = strl;
	this.init(name, start, stop + (step > 0 ? 1 : -1), step);
};
NumericRange.prototype = {
	__proto__: Range.prototype,
	format: function(val) {
		let rv = new String(Math.abs(val));
		while (rv.length < this.strl) {
			rv = '0' + rv;
		}
		if (val < 0) {
			return '-' + rv;
		}
		return rv;
	}	
};

/**
 * Alpha (Character) Range
 * @param name (string) Name (for any GUI representation)
 * @param start (int) Range start
 * @param stop (int) Range stop/end
 * @param step (int) Range step
 */
function CharRange(name, start, stop, step) {
	this.init(name, start, stop + (step > 0 ? 1 : -1), step);
};
CharRange.prototype = {
	__proto__: Range.prototype,
	format: String.fromCharCode
};

/**
 * Batch generator.
 * The provide URL will be parsed for any batch descriptors.
 * If some are found they are replaced accordingly
 * 
 * @param link URL to parse
 */
function BatchGenerator(link) {
	this.url = link.url;
	let url = link.usable;
	this._length = 1;
	this._pats = [];
	let i;
	
	// search all batchdescriptors
	while ((i = url.search(/\[.*?]/)) != -1) {
		// Heading string is a simple Literal
		if (i != 0) {
			this._pats.push(new Literal(url.substring(0, i)));
			url = url.slice(i);
		}
		
		let m;
		// Numeric range syntax
		if ((m = url.match(/^\[(-?\d+):(-?\d+)(?::(-?\d+))?\]/)) != null) {
			url = url.slice(m[0].length);
			try {
				let start = new Number(m[1]);
				let stop = new Number(m[2]);
				let step = stop > start ? 1 : -1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					step = new Number(m[3]);
				}
				this._checkRange(start, stop, step);
				if (start == stop) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				var x = m[Math.abs(start) > Math.abs(stop) ? 2 : 1];
				var sl = x.length;
				if (x.slice(0,1) == '-') {
					--sl;
				}
				this._pats.push(new NumericRange(m[0], start, stop, step, sl));
			}
			catch (ex) {
				Debug.log("Bad Numeric Range", ex);
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		
		// Alpha range syntax
		if ((m = url.match(/^\[([a-z]):([a-z])(?::(-?\d))?\]/)) || (m = url.match(/\[([A-Z]):([A-Z])(?::(-?\d))?\]/))) {
			url = url.slice(m[0].length);
			try {
				let start = m[1].charCodeAt(0);
				let stop = m[2].charCodeAt(0);
				let step = stop > start ? 1 : -1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					step = new Number(m[3]);
				}
				this._checkRange(start, stop, step);
				if (start == stop) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				this._pats.push(new CharRange(m[0], start, stop, step));
			}
			catch (ex) {
				Debug.log("Bad Char Range", ex);
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		
		// Unknown/invalid descriptor
		// Insert as Literal
		if ((m = url.match(/^\[.*?]/)) != null) {
			url = url.slice(m[0].length);
			this._pats.push(new Literal(m[0]));
			continue;
		}
		
		// Something very bad happened. Should never get here.
		throw new Exception("Failed to parse the expression");
	}
	// URL got a literal tail. Insert.
	if (url.length) {
		this._pats.push(new Literal(url));
	}
	
	// Join successive Literals. This will produce a faster generation later.
	for (i = this._pats.length - 2; i >= 0; --i) {
		if ((this._pats[i] instanceof Literal) && (this._pats[i + 1] instanceof Literal)) {
			this._pats[i] = new Literal(this._pats[i].str + this._pats[i + 1].str);
			this._pats.splice(i + 1, 1);
		}
	}
	
	// Calculate the total length of the batch
	for each (let i in this._pats) {
		this._length *= i.length;
	}
}
BatchGenerator.prototype = {
	_checkRange: function(start, stop, step) {
		// validate the range
		if (!step || (stop - start) / step < 0) {
			throw new Exception("step invalid!");
		}
	},
	_process: function(pats) {
		// Recursively called ;)
		// Keep this "static"
		
		if (pats.length == 0) {
			yield '';
			return;
		}
		let pat = pats.pop();
		for (let i in arguments.callee(pats)) {
			for (let j in pat.join(i)) {
				yield j;
			}
		}
	},
	
	/**
	 * Generates all URLs
	 * @return (generator) All URLs according to any batch descriptors 
	 */
	getURLs: function() {
		for (let i in this._process(this._pats)) {
			yield i;
		}
	},
	
	/**
	 * Expected number of generated Links
	 */
	get length() {
		return this._length;
	},
	
	/**
	 * All matched batch descriptors
	 * @return (array) Parts/descriptors
	 */
	get parts() {
		return this._pats
			.filter(function(e) { return !(e instanceof Literal); })
			.map(function(e) { return e.name; })
			.join(", ");
	},
	
	/**
	 * First URL that will be generated
	 */
	get first() {
		return this._pats.map(
			function(p) {
				return p.first;
			}
		).join('');
	},
	/**
	 * Last URL that will be generated
	 */
	get last() {
		return this._pats.map(
			function(p) {
				return p.last;
			}
		).join('');
	}
};