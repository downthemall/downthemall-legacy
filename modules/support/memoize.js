/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";


var caches = [];
function filterCaches(c) {
	c = c.get();
	if (!c) {
		return false;
	}
	c.clear();
	return true;
}
function cleanCaches() {
	caches = caches.filter(filterCaches);
}
require("support/memorypressure").add(cleanCaches);
unload(cleanCaches);

/**
 * Decorate a function with a memoization wrapper, with a limited-size cache
 * to reduce peak memory utilization.
 *
 * The memoized function may have any number of arguments, but they must be
 * be serializable.  It's safest to use this only on functions that accept
 * primitives.
 *
 * A memoized function is not thread-safe, but so is JS,  nor re-entrant-safe!
 *
 * @usage var foo = Scriptish_memoize(function foo(arg1, arg2) { ... complex operation ... });
 * @param {Function} func The function to be memoized
 * @param {Number} limit Optional. Cache size (default: 3000)
 * @param {Number} num_args Options. Number of arguments the function expects (default: func.length)
 * @return {Function} Memoized function
 */
exports.memoize = function memoize(func, limit, num_args) {
	limit = limit || 3000;
	num_args = num_args || func.length;

	var cache = new Map();
	caches.push(weak(cache));
	var keylist = [];
	var args = [];
	var key, result;

	switch (num_args) {
	case 0:
		throw new Error("memoize does not support functions without arguments");
	case 1:
		return function memoize_one_arg(a) {
			key = a.spec || a;
			if (cache.has(key)) {
				return cache.get(key);
			}

			result = func.call(null, a);
			cache.set(key, result);
			if (keylist.push(key) > limit)
				cache.delete(keylist.shift());
			return result;
		};
	case 2:
		return function memoize_two_args(a, b) {
			args[0] = a; args[1] = b;
			key = JSON.stringify(args);
			args.length = 0;

			if (cache.has(key)) {
				return cache.get(key);
			}

			var result = func.call(null, a, b);
			cache.set(key, result);
			if (keylist.push(key) > limit)
				cache.delete(keylist.shift());
			return result;
		};
	case 3:
		return function memoize_three_args(a, b, c) {
			args[0] = a; args[1] = b; args[2] = c;
			key = JSON.stringify(args);
			args.length = 0;

			if (cache.has(key)) {
				return cache.get(key);
			}

			var result = func.call(null, a, b, c);
			cache.set(key, result);
			if (keylist.push(key) > limit)
				cache.delete(keylist.shift());
			return result;
		};

	case 4:
		return function memoize_four_args(a, b, c, d) {
			args[0] = a; args[1] = b; args[2] = c; args[3] = d;
			key = JSON.stringify(args);
			args.length = 0;

			if (cache.has(key)) {
				return cache.get(key);
			}

			var result = func.call(null, a, b, c, d);
			cache.set(key, result);
			if (keylist.push(key) > limit)
				cache.delete(keylist.shift());
			return result;
		};

	default:
		return function() {
			var key = JSON.stringify(arguments);

			if (cache.has(key)) {
				return cache.get(key);
			}

			var result = func.apply(null, arguments);
			cache.set(key, result);
			if (keylist.push(key) > limit)
				cache.delete(keylist.shift());
			return result;
		};
	}
}
