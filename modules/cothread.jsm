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
 * The Original Code is DownThemAll CoThread module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
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

"use strict";

const EXPORTED_SYMBOLS = ['CoThread', 'CoThreadInterleaved', 'CoThreadListWalker'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;

module("resource://gre/modules/Services.jsm");
module("resource://gre/modules/XPCOMUtils.jsm");

const MainThread = Services.tm.mainThread;

// "Abstract" base c'tor
function CoThreadBase() {}
CoThreadBase.prototype = {
	_idx: 0,
	_ran: false,
	_finishFunc: null,

	init: function CoThreadBase_init(func, yieldEvery, thisCtx) {
		this._thisCtx = thisCtx ? thisCtx : this;

		// default to 1
		this._yieldEvery = typeof yieldEvery == 'number' ? Math.floor(yieldEvery) : 1;
		if (yieldEvery < 1) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}

		if (typeof func != 'function' && !(func instanceof Function)) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}
		this._func = func;
		this.init = function() {};
	},

	start: function CoThreadBase_run(finishFunc) {
		if (this._ran) {
			throw new Error("You cannot run a CoThread/CoThreadListWalker instance more than once.");
		}
		this._finishFunc = finishFunc;
		this._ran = true;
		MainThread.dispatch(this, 0);
	},

	QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsICancelable, Ci.nsIRunnable]),

	_terminated: false,

	run: function CoThreadBase_run() {
		if (this._terminated) {
			return;
		}

		let y = this._yieldEvery;
		let g = this._generator;
		let f = this._func;
		let ctx = this._thisCtx;
		let callf = this._callf;
		try {
			for (let i = 0; i < y; ++i) {
				if (!callf(ctx, g.next(), this._idx++, f)) {
					throw 'complete';
				}
			}
			if (!this._terminated) {
				MainThread.dispatch(this, 0);
			}
		}
		catch (ex) {
			this.cancel();
		}
	},

	cancel: function CoThreadBase_cancel() {
		if (this._terminated) {
			return;
		}
		this._terminated = true;
		if (this._finishFunc) {
			this._finishFunc.call(this._thisCtx);
		}
	}
}

/**
 * Constructs a new CoThread (aka. pseudo-thread).
 * A CoThread will repeatedly call a specified function, but "breaking"
 * the operation temporarily after a certain amount of calls,
 * so that the main thread gets a chance to process any outstanding
 * events.
 *
 * Example:
 *        Components.utils.import('resource://dta/cothread.jsm');
 *        new CoThread(
 *        	// What to do with each item?
 *          // Print it!
 *          function(count) document.write(count + "<br>") || (count < 30000),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000
 *        ).start();
 *
 * @param {Function} func Function to be called. Is passed call count as argument. Returning false will cancel the operation.
 * @param {Number} yieldEvery Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx Optional. The function will be called in the scope of this object (or if omitted in the scope of the CoThread instance)
 */
function CoThread(func, yieldEvery, thisCtx) {
	this.init(func, yieldEvery, thisCtx);

	// fake generator so we may use a common implementation. ;)
	this._generator = (function() { for(;;) { yield null }; })();
}

CoThread.prototype = {
	__proto__: CoThreadBase.prototype,

	_callf: function CoThread__callf(ctx, item, idx, func) {
		return func.call(ctx, idx);
	}
}
/**
 * Constructs a new CoThreadInterleaved (aka. pseudo-thread).
 * The CoThread will process a interleaved function (generator)
 *
 * Example:
 *        Components.utils.import('resource://dta/cothread.jsm');
 *        new CoThread(
 *          function(count) {
 *          	do_some();
 *          	yield true;
 *          	do_more();
 *          	yield true;
 *          	if (!do_even_more()) {
 *          		return;
 *          	}
 *          	do_last();
 *          },
 *          // When to turn over Control?
 *          // Each 2 items
 *          2
 *        ).start();
 *
 * @param {Function} func Function to be called. Is passed call count as argument. Returning false will cancel the operation.
 * @param {Number} yieldEvery Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx Optional. The function will be called in the scope of this object (or if omitted in the scope of the CoThread instance)
 */
function CoThreadInterleaved(generator, yieldEvery, thisCtx) {
		this.init(function() true, yieldEvery, thisCtx);
		if (typeof generator == "function") {
			this._generator = generator();
		}
		else {
			this._generator = generator;
		}
}
CoThreadInterleaved.prototype = {
	__proto__: CoThreadBase.prototype,

	_callf: function() true
};

/**
 * Constructs a new CoThreadListWalker (aka. pseudo-thread).
 * A CoThreadListWalker will walk a specified list and call a specified function
 * on each item, but "breaking" the operation temporarily after a
 * certain amount of processed items, so that the main thread may
 * process any outstanding events.
 *
 * Example:
 *        Components.utils.import('resource://dta/cothread.jsm');
 *        new CoThreadListWalker(
 *        	// What to do with each item?
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
 * @param {Function} func Function to be called on each item. Is passed item and index as arguments. Returning false will cancel the operation.
 * @param {Array/Generator} arrayOrGenerator Array or Generator object to be used as the input list
 * @param {Number} yieldEvery Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx Optional. The function will be called in the scope of this object (or if omitted in the scope of the CoThread instance)
 */
function CoThreadListWalker(func, arrayOrGenerator, yieldEvery, thisCtx) {
	this.init(func, yieldEvery, thisCtx);

	if (arrayOrGenerator instanceof Array || 'length' in arrayOrGenerator) {
		// make a generator
		this._generator = (i for each (i in arrayOrGenerator));
	}
	else {
		this._generator = arrayOrGenerator;
	}

	if (this._lastFunc && (typeof func != 'function' && !(func instanceof Function))) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
}

CoThreadListWalker.prototype = {
	__proto__: CoThreadBase.prototype,
	_callf: function CoThreadListWalker__callf(ctx, item, idx, func) {
		return func.call(ctx, item, idx);
	}
}
