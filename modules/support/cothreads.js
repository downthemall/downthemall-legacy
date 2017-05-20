/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {defer} = require("./defer");

class CoThreadBase {
	constructor(func, yieldEvery, thisCtx) {
		this._idx = 0;
		this._ran = false;
		this._finishFunc = null;
		this._thisCtx = thisCtx ? thisCtx : this;
		this._terminated = false;


		// default to 0 (adjust)
		this._yieldEvery = typeof yieldEvery === 'number' ? Math.floor(yieldEvery) : 0;

		if (typeof func !== 'function' && !(func instanceof Function)) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}
		this._func = func;
		this.init = function() {};
	}

	start(finishFunc) {
		if (this._ran) {
			throw new Error("You cannot run a CoThread/CoThreadListWalker instance more than once.");
		}
		this._finishFunc = finishFunc;
		this._ran = true;
		defer(this, 0);
	}

	run() {
		if (this._terminated) {
			return;
		}

		let y = this._yieldEvery;
		let g = this._generator;
		let f = this._func;
		let ctx = this._thisCtx;
		let callf = this._callf;
		const isStar = !('send' in g);
		try {
			if (y > 0) {
				let start = +new Date();
				for (let i = 0; i < y; ++i) {
					let next = g.next();
					if (isStar) {
						if (next.done) {
							throw "complete";
						}
						next = next.value;
					}
					if (!callf(ctx, next, this._idx++, f)) {
						throw 'complete';
					}
				}
				let diff = (+new Date()) - start;
				if (diff > 150 || diff < 30) {
					this._yieldEvery = Math.max(1, Math.round(y * 60 / diff));
				}
			}
			else {
				// adjustment pass
				let start = +new Date();
				let i = 0;
				for(; start + 60 > +new Date(); ++i) {
					let next = g.next();
					if (isStar) {
						if (next.done) {
							throw "complete";
						}
						next = next.value;
					}
					if (!callf(ctx, next, this._idx++, f)) {
						throw 'complete';
					}
				}
				this._yieldEvery = Math.max(i, 1);
			}
			if (!this._terminated) {
				defer(this);
			}
		}
		catch (ex) {
			this.cancel();
		}
	}

	cancel() {
		if (this._terminated) {
			return;
		}
		this._terminated = true;
		if (this._finishFunc) {
			this._finishFunc.call(this._thisCtx, this._yieldEvery);
		}
	}
}
Object.assign(CoThreadBase.prototype, {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsICancelable, Ci.nsIRunnable]),
});


/**
 * Constructs a new CoThread (aka. pseudo-thread).
 * A CoThread will repeatedly call a specified function, but "breaking"
 * the operation temporarily after a certain amount of calls,
 * so that the main thread gets a chance to process any outstanding
 * events.
 *
 * Example:
 *        new CoThread(
 *          // What to do with each item?
 *          // Print it!
 *          function(count) document.write(count + "<br>") || (count < 30000),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000
 *        ).start();
 *
 * @param {Function} func
 *                   Function to be called. Is passed call count as argument.
 *                   Returning false will cancel the operation.
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread.
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                 (or if omitted in the scope of the CoThread instance)
 */
exports.CoThread = class CoThread extends CoThreadBase {
	constructor(func, yieldEvery, thisCtx) {
		super(func, yieldEvery, thisCtx);
		// fake generator so we may use a common implementation. ;)
		this._generator = (function*() {
			for(;;) {
				yield null;
			}
		})();
	}
	_callf(ctx, i, idx, fn) {
		return fn.call(ctx, idx);
	}
};

/**
 * Constructs a new CoThreadInterleaved (aka. pseudo-thread).
 * The CoThread will process a interleaved function (generator)
 *
 * Example:
 *        new CoThread(
 *          function(count) {
 *            do_some();
 *            yield true;
 *            do_more();
 *            yield true;
 *            if (!do_even_more()) {
 *              return;
 *            }
 *            do_last();
 *          },
 *          // When to turn over Control?
 *          // Each 2 items
 *          2
 *        ).start();
 *
 * @param {Function} func
 *                   Function to be called. Is passed call count as argument.
 *                   Returning false will cancel the operation.
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                 (or if omitted in the scope of the CoThread instance)
 */
exports.CoThreadInterleaved = class CoThreadInterleaved extends CoThreadBase {
	constructor (generator, yieldEvery, thisCtx) {
		super(() => true, yieldEvery, thisCtx);
		this._generator = typeof(generator) === "function" ? generator() : generator;
	}
	_callf() {
		return true;
	}
};

/**
 * Constructs a new CoThreadListWalker (aka. pseudo-thread).
 * A CoThreadListWalker will walk a specified list and call a specified function
 * on each item, but "breaking" the operation temporarily after a
 * certain amount of processed items, so that the main thread may
 * process any outstanding events.
 *
 * Example:
 *        new CoThreadListWalker(
 *          // What to do with each item?
 *          // Print it!
 *          function(item, idx) document.write(item + "/" + idx + "<br>") || true,
 *          // What items?
 *          // 0 - 29999
 *          (function() { for (let i = 0; i < 30000; ++i) yield i; })(),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000,
 *          null,
 *        ).start(function() alert('done'));
 *
 * @param {Function} func
 *                   Function to be called on each item. Is passed item and index as arguments.
 *                   Returning false will cancel the operation.
 * @param {Array/Generator} arrayOrGenerator
 *                          Array or Generator object to be used as the input list
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                  (or if omitted in the scope of the CoThread instance)
 */
exports.CoThreadListWalker = class CoThreadListWalker extends CoThreadBase {
	constructor(func, arrayOrGenerator, yieldEvery, thisCtx) {
		super(func, yieldEvery, thisCtx);

		if (Array.isArray(arrayOrGenerator)) {
			// make a generator
			this._generator = (function*() {
				for (let i of arrayOrGenerator) {
					yield i;
				}
			})();
		}
		else {
			this._generator = arrayOrGenerator;
		}

		if (this._lastFunc && (typeof func !== 'function' && !(func instanceof Function))) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}
	}
	_callf(ctx, item, idx, fn) {
		return fn.call(ctx, item, idx);
	}
};
