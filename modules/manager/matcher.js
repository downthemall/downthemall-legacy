/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {FilterManager} = require("support/filtermanager");
const constants = require("constants");
const {COMPLETE, FINISHING} = constants;

const {
	SimpleIterator,
	StringBundles,
	filterInSitu
} = require("utils");

const _ = (function(global) {
	let bundles = new StringBundles([
		"chrome://dta/locale/common.properties",
		"chrome://dta/locale/manager.properties"
		]);
	return function() {
		if (arguments.length == 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	};
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
		return function TextMatcher(d) params.test(
			[d.urlManager.usable, d.description, d.fileName, d.destinationName].join(' ')
		);
	}
};

const FilterMatch = {
	get name() 'filtermatch',
	getItems: function() {
		for (let f in FilterManager.enumAll()) {
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
		for (let id of params) {
			try {
				filters.push(FilterManager.getFilter(id));
			}
			catch (ex) {
				log(LOG_ERROR, "not a filter: " + id, ex);
				// no op; might have changed
			}
		}
		if (!filters.length) {
			log(LOG_DEBUG, "No filters available for: " + params);
			return null;
		}
		let _m = FilterManager.getMatcherFor(filters);
		return function FilterMatcher(d) _m(d.urlManager.spec);
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
		for (let p of paths) {
			yield {
				label: p,
				param: btoa(p)
			};
		}
	},
	getMatcher: function(params) {
		params = params.map(function(e) atob(e));
		return function PathMatcher(d) params.indexOf(d.destinationPath) >= 0;
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
		for (let p of params) {
			let n = parseInt(p, 10);
			if (isFinite(n) && n > est) {
				est = n;
			}
		}
		return function RemainderMatcher(d) d.estimated <= est;
	}
};
const StatusMatch = {
	get name() 'statusmatch',
	getItems: function() {
		for (let s of ['QUEUED', 'PAUSED', 'RUNNING', 'COMPLETE', 'CANCELED']) {
			yield {
				label: _(s.toLowerCase()),
				param: s
			};
		}
	},
	getMatcher: function(params) {
		let state = params.reduce(function(p,c) p | constants[c], 0);
		if (state & COMPLETE) {
			state |= FINISHING;
		}
		return function StatusMatcher(d) d.state & state;
	}
};
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
		for (let [p, l] of SIZES) {
			yield {
				label: l,
				param: p
			};
		}
	},
	getMatcher: function(params) {
		function parseInt10(v) parseInt(v, 10);
		let ranges = [];
		for (let x of params) {
			let [l,h] = x.split('-').map(parseInt10);
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
		for (let p of domains) {
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
			log(LOG_ERROR, "trying to add a matcher that does not exist");
			return;
		}
		this.removeMatcher(name);
		let m = this._available[name].getMatcher(params);
		if (m) {
			log(LOG_DEBUG, "adding the matcher");
			this._matchers.push({name: name, isMatch: m});
			this._matchersLength = this._matchers.length;
		}
	},
	removeMatcher: function(name) {
		this._matchersLength = filterInSitu(this._matchers, function(m) m.name != name).length;
	},
	get filtering() !!this._matchersLength,
	filter: function(array) {
		let rv;
		for (let i = 0, e = this._matchers.length; i < e; ++i) {
			let m = this._matchers[i];
			let j = 0;
			let fnm = function(e) {
				let rv = m.isMatch(e);
				e.filteredPosition = rv ? j++ : -1;
				return rv;
			};
			if (!rv) {
				rv = array.filter(fnm);
			}
			else {
				filterInSitu(rv, fnm);
			}
		}
		return rv;
	},
	shouldDisplay: function(d) {
		for (let i = 0, e = this._matchers.length; i < e; ++i) {
			if (!this._matchers[i].isMatch(d)) {
				return false;
			}
		}
		return true;
	}
};

exports.Matcher = Matcher;
