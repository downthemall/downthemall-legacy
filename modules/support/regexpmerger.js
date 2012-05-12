/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const REG_TAINTED = /\\[ux]?\d/;
const REG_TAINTED_ESCAPES = /\\\\/g;

function tainted_filter(r) {
	// No negative lookbehind in js :p
	if (REG_TAINTED.test(r.replace(REG_TAINTED_ESCAPES, ""))) {
		this.push(r);
		return false;
	}
	return true;
}

/**
 * Array filter function to create an unique array
 * @usage arr.filter(unique_filter, Object.create(null));
 */
function unique_filter(e) !((e in this) || (this[e] = null));

/**
 * Return a good prefix, with no bracket mismatches
 *
 * @param {String} Calculate the prefix from
 * @return {String} Calculated safe prefix without bracket mismatches
 */
function killInvalidBrackets(string) {
	let c = 0; // num of unclosed (
	let C = 0; // num of unclosed [
	let good = -1; // last good position

	for (let i = 0, e = string.length; i < e; ++i) {
		let ch = string[i];

		if (ch == "\\") {
			// step over escaping
			++i;
			continue;
		}

		// ()
		if (ch == '(') {
			if (!C) {
				// not in a character class []
				if (!c) {
					// not open yet
					good = i - 1;
				}
				++c;
			}
			continue;
		}
		if (ch == ')') {
			if (!C) {
				// not in a character class
				--c;
				if (c < 0) {
					// cannot be valid and negative at the same time
					// At this point the regex would be bad
					break;
				}
				if (!c && !C) {
					// all closed
					good = i;
				}
			}
			continue;
		}

		// []
		if (ch == '[') {
			if (!C && !c) {
				// last good (nothing open)
				good = i - 1;
			}
			++C;
		}
		if (ch == ']') {
			--C;
			if (C < 0) {
				// cannot be valid and negative at the same time
				break;
			}
			if (!C && !c) {
				// all closed now
				good = i;
			}
		}
		if (ch == "{") {
			if (good == -1 || good != i - 1) {
				good = i - 2;
			}
			else if (good != -1 && string[good] == ")" || string[good] == "]") {
				// we don't really have a good position now :p
				good = -1;
				for (i = 0; i < e; ++i) {
					ch = string[i];
					if (ch == "\\") {
						++i;
					}
					else if (ch == "(" || ch == "[") {
						break;
					}
					++good;
				}
			}
			else {
				good -= 1;
			}
			// force not ok
			c = 1;
			break;
		}
	}

	if (c == 0 && C == 0) {
		// all closed, use whole string
		return string;
	}

	if (good >= 0) {
		// something is bad, but we got a good position
		return string.substring(0, good + 1);
	}

	// whole string is invalid
	return "";
}

/**
 * Splits a pattern into individual alternates, if any
 * @param {String} pattern Pattern to process
 * @param {Array} rv Result array patterns will be pushed to
 */
function splitAlternates(pattern, rv) {
	if (!pattern) {
		rv.push(pattern);
		return;
	}

	let c = 0; // num of unclosed (
	let C = 0; // num of unclosed [
	let cur = ""; // current alternate
	for (let i = 0, e = pattern.length; i < e; ++i) {
		let char = pattern[i];

		if (char == "\\") {
			cur += char + pattern[++i];
		}
		else if (char == "(") {
			if (!C) ++c;
			cur += char;
		}
		else if (char == ")") {
			if (!C) --c;
			cur += char;
		}
		else if (char == "[") {
			++C;
			cur += char;
		}
		else if (char == "]") {
			--C;
			cur += char;
		}
		else {
			if (char == "|" && !c && !C) {
				rv.push(cur);
				cur = "";
			}
			else {
				cur += char;
			}
		}
	}
	rv.push(cur);
}

/**
 * Recursively determine the the largest group with a common prefix
 * The group is guaranteed to contain at least 3 items
 *
 * @param {Array} patterns Patterns to process. Must be sorted.
 * @param {int} low Optional. Low bound. Default = 0
 * @param {int} high Optional. High bound. Default = patterns.length
 * @param {int} level Optional. Recursion level. Default = length
 */
function largestPrefixGroup(patterns, low, high, level) {
	level = level || 0;
	low = low || 0;
	high = high || patterns.length;

	// split patterns in heading char and tails
	let heads = patterns.map(function(p) p.charAt(0));
	let tails = patterns.map(function(p) p.substring(1));

	let besti = -1; // best starting match
	let beste = 0; // best ending match
	let bestc = 0; // num of matches

	for (let i = low; i < high - 1; ++i) {
		let allgood = true;

		for (let e = i + 1; e < high; ++e) {
			if (heads[i] == heads[e]) {
				continue;
			}

			// mismatched!
			let c = e - i;
			if (bestc < c) {
				bestc = c;
				beste = e;
				besti = i;
			}
			allgood = false;
			break;
		}

		if (allgood) {
			let c = high - i;
			if (bestc < c) {
				bestc = c;
				besti = i;
				beste = high;
			}
		}
	}

	if (bestc < Math.min(4, Math.max(2, patterns.length))) {
		// at least 3 items in the group are required
		return [0,0,0];
	}

	let prefix = heads[besti];

	if (tails.some(function(p) p.length == 0)) {
		return [besti, beste, prefix];
	}

	let [nlow, nhigh, np] = largestPrefixGroup(tails, besti, beste, level + 1);
	if (nhigh) {
		prefix += np;
		if (!level) {
			// root level needs to check for bracket mismatches
			// this might cause the group to get smaller than it has to be
			// Consumers should/will account for this
			prefix = killInvalidBrackets(prefix);
		}
		return [nlow, nhigh, prefix];
	}

	return [besti, beste, prefix];
}

/**
 * Merge prefix group with set of patterns according to bounds and prefix
 *
 * @param {Array} patterns Set of patterns
 * @param {int} low Lower bound
 * @param {int} high Higher bound
 * @param {String} prefix Prefix of the group
 * @return {Array} mutated & reduced patterns array where the patterns
 *                  specified by the low & high params are merged.
 */
function mergePatterns(patterns, low, high, prefix) {
	let pl = prefix.length;

	// splice the patterns to be merged, chop off their common prefix and join
	let tails = patterns.splice(low, high - low).map(function(p) p.substring(pl));

	// if there is an empty tail, then we can omit the whole group
	let newpattern = "";
	if (tails.indexOf("") == -1) {
		newpattern = tails.join("|");
	}

	if (prefix && newpattern) {
		newpattern = prefix + "(?:" + newpattern + ")";
	}
	else if (prefix) {
		newpattern = prefix;
	}

	// Add the merged pattern
	patterns.push(newpattern);

	// need to return sorted as largestPrefixGroup relies on sorting
	return patterns.sort();
}

function merge_finish_map(e) "(?:" + e + ")";

function merge_finish(patterns, tainted) {
	patterns = patterns.concat(tainted);
	if (patterns.length < 2) {
		return patterns[0];
	}
	return patterns.map(merge_finish_map).join("|");
}

/**
 * Merge patterns with optimizations (prefixes)
 * @param {Array} patterns Patterns to merge
 * @returns {String} Resulting merged and optimized pattern
 */
exports.merge = function merge(patterns) {
	if (patterns.length < 2) {
		return patterns[0];
	}

	// Copy patterns and make unique
	patterns = patterns.filter(unique_filter, Object.create(null));
	if (patterns.length < 2) {
		return patterns[0];
	}

	// Remove tainted patterns for now
	let tainted = [];
	patterns = patterns.filter(tainted_filter, tainted);


	// split patterns into pieces by top-level alternates
	let newpatterns = [];
	for (let [,p] in Iterator(patterns)) {
		splitAlternates(p, newpatterns);
	}
	patterns = newpatterns.filter(unique_filter, Object.create(null));
	if (patterns.length < 2) {
		return merge_finish(patterns, tainted);
	}

	// Good to go
	patterns.sort();

	for (;;) {
		let [i, e, prefix] = largestPrefixGroup(patterns);
		if (!e) {
			// no common prefix found in (remaining) patterns
			break;
		}
		patterns = mergePatterns(patterns, i, e, prefix);
	}

	let len = patterns.length;
	if (len == 1) {
		// already merged into a single pattern
		return merge_finish(patterns, tainted);
	}

	// not yet a single pattern (i.e. not all patterns shared a common prefix)
	// merge without a prefix to get single pattern
	return merge_finish(mergePatterns(patterns, 0, len, ""), tainted);
}
