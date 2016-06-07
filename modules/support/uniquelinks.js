/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// must be require_mini compatible!

/**
 * Filter arrays in-situ. Like Array.filter, but in place
 *
 * @param {Array} arr
 * @param {Function} cb
 * @param {Object} tp
 * @returns {Array} Filtered array (identity)
 */
exports.filterInSitu = function filterInSitu(arr, cb, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = arr[i]; // replace filtered items
		if (a && cb.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
};

/**
 * Map arrays in-situ. Like Array.map, but in place.
 * @param {Array} arr
 * @param {Function} cb
 * @param {Object} tp
 * @returns {Array} Mapped array (identity)
 */
exports.mapInSitu = function mapInSitu(arr, cb, tp) {
	tp = tp || null;
	for (let i = 0, e = arr.length; i < e; i++) {
		arr[i] = cb.call(tp, arr[i], i, arr);
	}
	return arr;
};

/**
 * Filters and then maps an array in-situ
 * @param {Array} arr
 * @param {Function} filterStep
 * @param {Function} mapStep
 * @param {Object} tp
 * @returns {Array} Filtered and mapped array (identity)
 */
exports.filterMapInSitu = function filterMapInSitu(arr, filterStep, mapStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[i]; // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			arr[k] = mapStep.call(tp, a, i, arr);
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
};

/**
 * Map and then filter an array in place
 *
 * @param {Array} arr
 * @param {Function} mapStep
 * @param {Function} filterStep
 * @param {Object} tp
 * @returns {Array} Mapped and filtered array (identity)
 */
exports.mapFilterInSitu = function mapFilterInSitu(arr, mapStep, filterStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = mapStep.call(tp, arr[i], i, arr); // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
};

exports.unique = i => {
	return exports.filterInSitu(i, function(e) {
		let u = e.url.spec;
		let other = this[u];
		if (other) {
			if (!other.description) {
				other.description = e.description;
			}
			if (!other.fileName) {
				other.fileName = e.fileName;
			}
			return false;
		}
		this[u] = e;
		return true;
	}, Object.create(null));
};
