/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1/MIT
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
 * The Original Code is memoize module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"),
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"), or
 * the MIT License (the "MIT") or later in which case the provisions of the
 * GPL, the LGPL or the MIT are applicable instead of those above. If you wish
 * to allow use of your version of this file only under the terms of either the
 * GPL, the LGPL or the MIT, and not to allow others to use your version of this
 * file under the terms of the MPL, indicate your decision by deleting the
 * provisions above and replace them with the notice and other provisions
 * required by the GPL or the LGPL. If you do not delete the provisions above,
 * a recipient may use your version of this file under the terms of any one of
 * the MPL, the GPL, the LGPL or the MIT.
 *
 * ***** END LICENSE BLOCK ***** */
"use strict";
var EXPORTED_SYMBOLS = ["memoize"];

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
function memoize(func, limit, num_args) {
	limit = limit || 3000;
	num_args = num_args || func.length;

	var cache = Object.create(null);
	var keylist = [];
	var args = [];
	var key, result;

	switch (num_args) {
	case 0:
		throw new Error("memoize does not support functions without arguments");
	case 1:
		return function memoize_one_arg(a) {
			key = a.spec || a.toString();

			if (key in cache)
				return cache[key];

			result = func.call(null, a);
			cache[key] = result;
			if (keylist.push(key) > limit)
				delete cache[keylist.shift()];
			return result;
		};
	case 2:
		return function memoize_two_args(a, b) {
			args[0] = a; args[1] = b;
			key = JSON.stringify(args);
			args.length = 0;

			if (key in cache)
				return cache[key];

			var result = func.call(null, a, b);
			cache[key] = result;
			if (keylist.push(key) > limit)
				delete cache[keylist.shift()];
			return result;
		};
	case 3:
		return function memoize_three_args(a, b, c) {
			args[0] = a; args[1] = b; args[2] = c;
			key = JSON.stringify(args);
			args.length = 0;

			if (key in cache)
				return cache[key];

			var result = func.call(null, a, b, c);
			cache[key] = result;
			if (keylist.push(key) > limit)
				delete cache[keylist.shift()];
			return result;
		};

	case 4:
		return function memoize_four_args(a, b, c, d) {
			args[0] = a; args[1] = b; args[2] = c; args[3] = d;
			key = JSON.stringify(args);
			args.length = 0;

			if (key in cache)
				return cache[key];

			var result = func.call(null, a, b, c, d);
			cache[key] = result;
			if (keylist.push(key) > limit)
				delete cache[keylist.shift()];
			return result;
		};

	default:
		return function() {
			var key = JSON.stringify(arguments);
			if (key in cache)
				return cache[key];

			var result = func.apply(this, arguments);
			cache[key] = result;
			if (keylist.push(key) > limit)
				delete cache[keylist.shift()];
			return result;
		};
	}
}
