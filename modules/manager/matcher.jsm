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
 * The Original Code is DownThemAll! Matcher module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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

"use strict";

const EXPORTED_SYMBOLS = ['Matcher'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

let DTA = {};
module('resource://dta/glue.jsm');
module('resource://dta/api.jsm', DTA);
requireJoined(DTA, "constants");
module('resource://dta/utils.jsm');

extendString(String);

(function(global) {
	let strings = {};
	for each (let f in ['common.properties', 'manager.properties']) {
		for (let s in new SimpleIterator(
			Services.strings
				.createBundle('chrome://dta/locale/' + f)
				.getSimpleEnumeration(),
			Ci.nsIPropertyElement
		)) {
			strings[s.key] = s.value;
		}
	}
	let bundles = new StringBundles(strings);
	global['_'] = function() (arguments.length == 1) ? bundles.getString(arguments[0]) : bundles.getFormattedString.apply(bundles, arguments);
})(this);


const TextMatch = {
	get name() 'textmatch',
	getMatcher: function(params) {
		params = new RegExp(
			params.map(function(e) e
				.replace(/^\s+|\s+$/g, '')
				.replace(/([/{}()\[\]\\^$.])/g, "\\$1")
				.replace(/\*/g, ".*")
				.replace(/\?/g, '.')
			).join('|'),
			'i'
		);
		return function(d) params.test(
			[d.urlManager.usable, d.description, d.fileName, d.destinationName].join(' ')
		);
	}
};

const FilterMatch = {
	get name() 'filtermatch',
	getItems: function() {
		for (let f in DTA.FilterManager.enumAll()) {
			if (f.id == "deffilter-all") {
				continue;
			}
			yield {
				label: f.label,
				param: f.id
			};
		}
	},
	getMatcher: function(params) {
		let filters = [];
		for each (let id in params) {
			try {
				filters.push(DTA.FilterManager.getFilter(id));
			}
			catch (ex) {
				if (Logger.enabled) {
					Logger.log("not a filter: " + id, ex);
				}
				// no op; might have changed
			}
		}
		if (!filters.length) {
			if (Logger.enabled) {
				Logger.log("No filters available for: " + params);
			}
			return null;
		}
		let _m = DTA.FilterManager.getMatcherFor(filters);
		return function(d) _m(d.urlManager.url.spec);
	}
};

const PathMatch = {
	get name() 'pathmatch',
	getItems: function(downloads) {
		let paths = filterInSitu(
			downloads.map(function(d) d.destinationPath),
			function(e) !((e in this) || (this[e] = null)),
			{}
			);
		paths.sort();
		for each (let p in paths) {
			yield {
				label: p,
				param: btoa(p)
			};
		}
	},
	getMatcher: function(params) {
		params = params.map(function(e) atob(e));
		return function(d) params.indexOf(d.destinationPath) >= 0;
	}
};

const RemainderMatch = {
	get name() 'remainder',
	getItems: function() {
		yield {
			label: _('soonfinished'),
			param: '120',
			radio: 'est'
		};
		yield {
			label: _('next10mins'),
			param: '600',
			radio: 'est'
		};
		yield {
			label: _('nexthour'),
			param: '3600',
			radio: 'est'
		};
		yield {
			label: _('next6hours'),
			param: '21600',
			radio: 'est'
		};
		yield {
			label: _('nextday'),
			param: '86400',
			radio: 'est'
		};
	},
	getMatcher: function(params) {
		let state = 0;
		let est = 0;
		for each (let p in params) {
			let n = parseInt(p, 10);
			if (isFinite(n) && n > est) {
				est = n;
			}
		}
		return function(d) d.estimated <= est;
	}
}
const StatusMatch = {
		get name() 'statusmatch',
		getItems: function() {
			for each (let s in ['QUEUED', 'PAUSED', 'RUNNING', 'COMPLETE', 'CANCELED']) {
				yield {
					label: _(s.toLowerCase()),
					param: s
				};
			}
		},
		getMatcher: function(params) {
			let state = params.reduce(function(p,c) p | DTA[c], 0);
			if (state & DTA.COMPLETE) {
				state |= DTA.FINISHING;
			}
			return function(d) d.state & state;
		}
}
requireJoined(StatusMatch, "constants");

const SIZES = [
	['-0', _('unknown')],
	['0-1024', _('verysmallfiles')],
	['1024-1048576', _('smallfiles')],
	['1048576-262144000', _('mediumfiles')],
	['262144000-524288000', _('largefiles')],
	['524288000-4294967296', _('verylargefiles')],
	['4294967296-', _('hugefiles')]
];
const SizeMatch = {
	get name() 'sizematch',
	getItems: function() {
		for each (let [p, l] in SIZES) {
			yield {
				label: l,
				param: p
			};
		}
	},
	getMatcher: function(params) {
		let ranges = [];
		for each (let x in params) {
			let [l,h] = x.split('-').map(function(v) parseInt(v));
			ranges.push({low: l, high: h});
		}
		if (!ranges.length) {
			return null;
		}
		// combine ranges
		for (let i = ranges.length - 2; i >= 0; --i) {
			if (ranges[i].high == ranges[i+1].low) {
				ranges[i].high = ranges[i+1].high;
				ranges.splice(i+1,1);
			}
		}

		// map to fastpath functions
		ranges = ranges.map(function(r) {
			let low = r.low;
			let high = r.high;
			if (!isFinite(low)) {
				return function(size) size <= high;
			}
			if (!isFinite(high)) {
				return function(size) size > low;
			}
			return function(size) size > low && size <= high;
		});

		if (ranges.length == 1) {
			let rf = ranges.shift();
			return function(d) rf(d.totalSize);
		}
		return function(d) ranges.some(function(rf) rf(d.totalSize));
	}
};

const DomainMatch = {
	get name() 'domainmatch',
	getItems: function(downloads) {
		let domains = filterInSitu(
				downloads.map(function(d) d.urlManager.domain),
				function(e) !((e in this) || (this[e] = null)),
				{}
				);
		domains.sort();
		for each (let p in domains) {
			yield {
				label: p,
				param: btoa(p)
			};
		}
	},
	getMatcher: function(params) {
		params = params.map(function(e) atob(e));
		return function(d) params.indexOf(d.urlManager.domain) >= 0;
	}
};

function MatcherTee(a, b) {
	this.a = a;
	this.b = b;
}
MatcherTee.prototype = {
	get name() this.a + ";" + this.b,
	getItems: function(downloads) {
		for (let a in this.a.getItems(downloads)) {
			a.param = "a:" + a.param;
			yield a;
		}
		yield {label: '-'};
		for (let b in this.b.getItems(downloads)) {
			b.param = "b:" + b.param;
			yield b;
		}
	},
	getMatcher: function(params) {
		let a = [], b = [];
		params.forEach(function(p) this[p[0]].push(p.substr(2)), {a:a, b:b});
		if (a.length && !b.length) {
			return this.a.getMatcher(a);
		}
		if (!a.length && b.length) {
			return this.b.getMatcher(b);
		}
		if (!a.length && !b.length) {
			return null;
		}
		a = this.a.getMatcher(a);
		b = this.b.getMatcher(b);
		return function(d) a(d) && b(d);
	}
};

function Matcher() {
	this._matchers = [];
	this._matchersLength = 0;
}
Matcher.prototype = {
	_available: {
		'textmatch': TextMatch,
		'downloadmatch': new MatcherTee(FilterMatch, DomainMatch),
		'pathmatch': PathMatch,
		'statusmatch': new MatcherTee(StatusMatch, RemainderMatch),
		'sizematch': SizeMatch,
		'domainmatch': DomainMatch
	},
	getItems: function(name, downloads) {
		for (let i in this._available[name].getItems(downloads)) {
			yield i;
		}
	},
	addMatcher: function(name, params) {
		if (!(name in this._available)) {
			if (Logger.enabled) {
				Logger.log("trying to add a matcher that does not exist");
			}
			return;
		}
		this.removeMatcher(name);
		let m = this._available[name].getMatcher(params);
		if (m) {
			if (Logger.enabled) {
				Logger.log("adding the matcher");
			}
			this._matchers.push({name: name, isMatch: m});
			this._matchersLength = this._matchers.length;
		}
	},
	removeMatcher: function(name) {
		this._matchersLength = filterInSitu(this._matchers, function(m) m.name != name).length;
	},
	get filtering() !!this._matchersLength,
	filter: function(array) array.filter(function(e) this._matchers.every(function(m) m.isMatch(e)), this),
	shouldDisplay: function(d) {
		for (let i = 0; i < this._matchersLength; ++i) {
			if (!this._matchers[i].isMatch(d)) {
				return false;
			}
		}
		return true;
	}
};
