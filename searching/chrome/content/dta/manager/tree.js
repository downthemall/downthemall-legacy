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
 * The Original Code is DownThemAll!
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
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
 
var Tree = {
	_filter: '',
	
	init: function T_init(elem) {
		this.elem = elem;
		this._downloads = [];
		this._displayed = this._downloads;

		let as = 	Cc["@mozilla.org/atom-service;1"]
			.getService(Ci.nsIAtomService);
		['iconic', 'completed', 'inprogress', 'paused', 'canceled', 'filtered'].forEach(
			function(e) {
				this['_' + e] = as.getAtom(e);
			},
			this
		);
		this.elem.view = this;	
		
	},

	get count() {
		return this._downloads.length;
	},
	
	/*
	 * actual nsITreeView follows
	 */
	get rowCount() {
		return this._displayed.length;
	},
	setTree: function T_setTree(box) {
		this._box = box;
	},
	getParentIndex: function T_getParentIndex(idx) {
		// no parents, as we are actually a list
		return -1;
	},
	getLevel: function T_getLevel(idx) {
		// ... and being a list all nodes are on the same level
		return 0;
	},
	getCellText: function T_getCellText(idx, col) {
		let d = this._displayed[idx];

		switch (col.index) {
			case 0: return Prefs.showOnlyFilenames ? d.destinationName : d.urlManager.usable;
			case 2: return d.percent;
			case 3: return d.dimensionString;
			case 4: return d.status;
			case 5: return d.speed;
			case 6: return d.parts;
			case 7: return d.mask;
			case 8: return d.destinationPath;
			case 9: return d.prettyHash;
		}
		return '';
	},
	isSorted: function T_isSorted() { return false; },
	isContainer: function T_isContainer(idx) { return false; },
	isContainerOpen: function T_isContainerOpen(idx) { return false; },
	isContainerEmpty: function T_isContainerEmpty(idx) { return false;},
	isSeparator: function T_isSeparator(idx) { return false; },
	isEditable: function T_isEditable(idx) { return true;	},
	getImageSrc: function T_getImageSrc(idx, col) {
		switch (col.index) {
			case 0: return this._displayed[idx].icon;
		}
		return null;
	},
	getProgressMode : function T_getProgressMode(idx, col) {
		if (col.index == 1) {
			return Ci.nsITreeView.PROGRESS_NORMAL;
		}
		return Ci.nsITreeView.PROGRESS_NONE;
	},
	// will be called for cells other than textcells
	getCellValue: function T_getCellValue(idx, col) {
		if (col.index == 1) {
			let d = this._displayed[idx];
			if (d.is(CANCELED)) {
				return 100; 
			}
			return d.totalSize ? d.partialSize * 100 / d.totalSize : 0;
		}
		return null;
	},
	getCellProperties: function T_getCellProperties(idx, col, prop) {
		if (col.index == 1) {
			let d = this._displayed[idx];
			switch (d.state) {
				case COMPLETE: prop.AppendElement(this._completed); return;
				case PAUSED: prop.AppendElement(this._paused); return;
				case FINISHING:
				case RUNNING: prop.AppendElement(this._inprogress); return;
				case CANCELED: prop.AppendElement(this._canceled); return;
			}
		}
		else if (col.index == 0) {
			prop.AppendElement(this._iconic);
		}
	},
	// just some stubs we need to provide anyway to implement a full nsITreeView
	cycleHeader: function T_cycleHeader(col, elem) {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getColumnProperties: function(column, element, prop) {},
	getRowProperties: function(idx, prop) {},
	setCellValue: function(idx, col, value) {},
	selectionChanged: function T_selectionChanged() {
		this.refreshTools();
	},
	_updating: 0,
	beginUpdate: function T_beginUpdate() {
		if (++this._updating == 1) {
			this._box.beginUpdateBatch();
		}
	},
	endUpdate: function T_endUpdate() {
		if (--this._updating == 0) {
			this._box.endUpdateBatch();
			this.refreshTools();
		}
	},
	add: function T_add(download) {
		this._downloads.push(download);
		download.position = this._downloads.length - 1;
		if (!this._updating) {
			this._box.rowCountChanged(download.position, 1);
		}
	},
	// XXX: get rowCountChanged, selection, focus right
	remove: function T_remove(downloads) {
		if (downloads && !(downloads instanceof Array)) {
			downloads = [downloads];
		}
		else {
			downloads = this._getSelectedIds(true).map(
				function(idx) {
					return this._downloads[idx]; 
				},
				this
			);
		}
		if (!downloads.length) {
			return;
		}
		this.selection.clearSelection();		
		downloads = downloads.sort(function(a, b) { return b.position - a.position; });	 
		SessionManager.beginUpdate();
		this.beginUpdate();
		let last = 0;
		downloads.forEach(
			function(d) {
				if (d.is(FINISHING)) {
					// un-removable :p
					return;
				}
				// wipe out any info/tmpFiles
				if (!d.is(COMPLETE, CANCELED)) {
					d.cancel();
				}
				SessionManager.deleteDownload(d);
				this._downloads.splice(d.position, 1);
				this._box.rowCountChanged(d.position, -1);
				last = Math.max(d.position, last);
				delete d.position;
			},
			this
		);
		SessionManager.endUpdate();
		this.endUpdate();
		this.invalidate();
		this._removeCleanup(downloads.length, last);
		SessionManager.savePositions();		
	},
	removeCompleted: function T_removeCompleted() {
		SessionManager.beginUpdate();
		this.beginUpdate();
		let delta = this._downloads.length, last = 0;
		for (let i = delta - 1; i > -1; --i) {
			let d = this._downloads[i];
			if (!d.is(COMPLETE)) {
				continue;
			}
			SessionManager.deleteDownload(d);
			this._downloads.splice(d.position, 1);
			this._box.rowCountChanged(d.position, -1);
			last = Math.max(d.position, last);
			delete d.position;
		}
		SessionManager.endUpdate();
		this.selection.clearSelection();
		this.endUpdate();	
		this.invalidate();
		this._removeCleanup(delta - this._downloads.length, last);
		SessionManager.savePositions();		
	},
	_removeCleanup: function(delta, last) {
		if (!this.rowCount) {
			this._box.ensureRowIsVisible(0);
		}
		else {
			let np = Math.max(0, Math.min(last - delta + 1, this.rowCount - 1));
			if (np < this._box.getFirstVisibleRow() || np > this._box.getLastVisibleRow()) {
				this._box.ensureRowIsVisible(np);
			}
			this.selection.currentIndex = np;			
		}
	},
	pause: function T_pause() {
		this.updateSelected(
			function(d) {
				if (d.is(QUEUED) || (d.is(RUNNING) && d.resumable)) {
					d.pause();
					d.speed = '';
					d.status = _("paused");
					d.state = PAUSED;
				}
				return true;
			}
		);
	},
	resume: function T_resume(d) {
		this.updateSelected(
			function(d) {
				if (d.is(PAUSED, CANCELED)) {
					d.state = QUEUED;
					d.status = _("inqueue");
				}
				return true;
			}
		);
	},
	cancel: function T_cancel() {
		this.updateSelected(function(d) { d.cancel(); return true; });
	},
	selectAll: function T_selectAll() {
		this.selection.selectAll();
		this.selectionChanged();
	},
	selectInv: function T_selectInv() {
		for (let d in this.all) {
			this.selection.toggleSelect(d.position);
		}
	},
	changeChunks: function T_changeChunks(increase) {
		function inc(d) {
			if (d.maxChunks < 10 && d.resumable) {
					++d.maxChunks;
			}
		};
		function dec(d) {
			if (d.maxChunks > 1) {
				--d.maxChunks;
			}		 
		};
		
		Tree.updateSelected(increase ? inc : dec);
	},
	force: function T_force() {
		for (let d in Tree.selected) {
			if (d.is(QUEUED, PAUSED, CANCELED)) {
				Dialog.run(d);
			}
		}
	},
	showInfo: function T_showInfo() {
		this.beginUpdate();
		let downloads = [];
		for (let d in Tree.selected) {
			downloads.push(d);
		}
		if (downloads.length) {
			window.openDialog("chrome://dta/content/dta/manager/info.xul","_blank","chrome, centerscreen, dialog=no", downloads, this);		 
		}
		this.endUpdate();
	},
	showTip: function(event) {
		try {
			if (!Preferences.getDTA("showtooltip", true)) {
				return false;
			}
			let row = {};
			this._box.getCellAt(event.clientX, event.clientY, row, {}, {});
			if (row.value == -1) {
				return false;
			}
			let d = this.at(row.value);
			$("infoIcon").src = d.largeIcon;
			$("infoURL").value = d.urlManager.url;
			$("infoDest").value = d.destinationFile;
	
			Tooltip.start(d);			
			return true;
		}
		catch(ex) {
			Debug.dump("Tooltip.show():", ex);
		}
		return false;
	},	
	stopTip: function T_stopTip() {
		Tooltip.stop();
	},
	doFilter: function T_doFilter() {
		this.beginUpdate();
		this._box.rowCountChanged(0, -this.rowCount);
		if (!this._filter) {
			this._displayed = this._downloads;
		}
		else {
			this._displayed = [];
			let expr = DTA_strToRegExp(this._filter);
			for (i in this.all) {
				if (expr.test(i.filterComparator)) {
					this._displayed.push(i);
				}
			}
		}
		this._box.rowCountChanged(0, this.rowCount);
		this.endUpdate();
	},
	setFilter: function T_setFilter(str) {
		if (this._filterTimer) {
			this._filterTimer.kill();
		}
		this._filter = str;
		this._filterTimer = new Timer('Tree.doFilter();', 250);
	},
	refreshTools: function T_refreshTools(d) {
		if (this._updating || (d && ('position' in d) && !this.selection.isSelected(d.position))) {
			return;
		}
		try {
			let empty = this.current == null;
			$('info', 'remove', 'movetop', 'moveup', 'movedown', 'movebottom', 'toolmovetop', 'toolmoveup', 'toolmovedown', 'toolmovebottom')
				.forEach(
					function(o) { return o.setAttribute('disabled', empty); },
					this
				);
				
			let states = {
				state: 0,
				resumable: false,
				is: QueueItem.prototype.is
			};
			for (let d in this.selected) {
				states.state |= d.state;
				states.resumable |= d.resumable;
			}
							
			function modifySome(items, f) {
				let disabled;
				if (empty) {
					disabled = true;
				}
				else {
					disabled = !f(states);
				}
				items.forEach(
					function(o) {
						o.setAttribute('disabled', disabled);
					}
				);
			}
			modifySome($('play', 'toolplay'), function(d) { return !d.is(COMPLETE, RUNNING, QUEUED, FINISHING); });
			modifySome($('pause', 'toolpause'), function(d) { return (d.state & RUNNING && d.resumable) || (d.state & QUEUED); });
			modifySome($('cancel', 'toolcancel'), function(d) { return !d.is(FINISHING, CANCELED); });
			modifySome($('launch', 'folder', 'delete'), function(d) { return d.is(COMPLETE); });
			modifySome($('addchunk', 'removechunk', 'force'), function(d) { return d.is(QUEUED, RUNNING, PAUSED); });
		}
		catch (ex) {
			Debug.dump("rt", ex);
		}
	},
	invalidate: function T_invalidate(d) {
		if (!d) {
			let complete = 0;
			this._downloads.forEach(
				function(e, i) {
					e.position = i;
					if (e.is(COMPLETE)) {
						complete++;
					}
				}
			);
			this._box.invalidate();
			this.refreshTools(this);
			this.doFilter();
			Dialog.completed = complete;
		}
		else if (d instanceof Array) {
			this.beginUpdate();
			d.forEach(
				function(e) {
					this.invalidate(e);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
		}
		else if ('position' in d) {
			this._box.invalidateRow(d.position);
		}
	},
	get box() {
		return this._box;
	},
	// generator for all download elements.
	get all() {
		for (let i = 0, e = this._downloads.length; i < e; ++i) {
			yield this._downloads[i];
		}
	},
	// generator for selected download elements.
	// do not make any assumptions about the order.
	get selected() {
		// loop through the selection as usual
		for (let i = 0, e = this.selection.getRangeCount(); i < e; ++i) {
			let start = {}, end = {value: -1};
			this.selection.getRangeAt(i, start, end);
			for (let j = start.value, k = end.value; j <= k; ++j) {
					yield this._displayed[j];
			}
		}
	},
	// returns an ASC sorted array of IDs that are currently selected and clears the selection.
	// note that this refers to the base list, not the displayed subset.
	_getSelectedIds: function T_getSelectedIds(getReversed) {
		var rv = [];
		let select = this.selection;
		// loop through the selection as usual
		for (let i = 0, e = select.getRangeCount(); i < e; ++i) {
				let start = {}, end = {};
				this.selection.getRangeAt(i, start, end);
				for (let j = start.value, k = end.value; j <= k; ++j) {
					rv.push(this._displayed[j].position);
				}
		}
		this.selection.clearSelection();
		if (getReversed) {
			rv.sort(function(a, b) { return b - a; });
		}
		else {
			rv.sort(function(a, b) { return a - b; });
		}
		return rv;
	},
	get current() {
		let ci = this.selection.currentIndex;
		if (ci > -1 && ci < this.rowCount && this.selection.isSelected(ci)) {
			return this._displayed[ci];
		}
		return null;		
	},
	at: function T_at(idx) {
		return this._displayed[idx];
	},
	some: function T_some(f, t) {
		return this._downloads.some(f, t);
	},
	every: function T_every(f, t) {
		return this._downloads.every(f, t);
	},
	update: function T_update(f, t) {
		this.beginUpdate();
		f.call(t);
		this.endUpdate();
	},
	updateSelected: function T_updateSelected(f, t) {
		this.beginUpdate();
		for (d in this.selected) {
			if (!f.call(t, d)) {
				break;
			}
		}
		this.endUpdate();
	},
	updateAll: function T_updateAll(f, t) {
		this.beginUpdate();
		for (d in this.all) {
			if (!f.call(t, d)) {
				break;
			}
		}
		this.endUpdate();
	},
	// XXX: fix moving + reselection after downloads/displayed changes
	top: function T_top() {
		try {
			this.beginUpdate();
			let ids = this._getSelectedIds(true); 
			ids.forEach(
				function(id, idx) {
					id = id + idx;
					this._downloads.unshift(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(0, ids.length - 1, true);
			this._box.ensureRowIsVisible(0);
			SessionManager.savePositions();			
		}
		catch (ex) {
			Debug.dump("Mover::top", ex);
		} 
	},
	bottom: function T_bottom() {
		try {
			this.beginUpdate();
			let ids = this._getSelectedIds();
			ids = ids.map(
				function(id, idx) {
					id = id - idx;
					this._downloads.push(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(this._downloads.length - ids.length, this._downloads.length - 1, true);
			this._box.ensureRowIsVisible(this.rowCount - 1);
			SessionManager.savePositions();			
		}
		catch (ex) {
			Debug.dump("Mover::bottom", ex);
		} 
	},
	up: function T_up() {
		try {
			this.beginUpdate();
			var ids = this._getSelectedIds().map(
				function(id, idx) {
					if (id - idx != 0) {
						[this._downloads[id], this._downloads[id - 1]] = [this._downloads[id - 1], this._downloads[id]];
						--id;
					}
					this.selection.rangedSelect(id, id, true);
					return id;
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this._box.ensureRowIsVisible(Math.max(ids.shift() - 1, 0));
			SessionManager.savePositions();			
		}
		catch (ex) {
			Debug.dump("Mover::up", ex);
		}	 
	},
	down: function T_down() {
		try {
			this.beginUpdate();
			let rowCount = this.rowCount;
			let ids = this._getSelectedIds(true).map(
				function(id, idx) {
					if (id + idx != rowCount - 1) {
						let tmp = this._downloads[id];
						this._downloads[id] = this._downloads[id + 1];
						this._downloads[id + 1] = tmp;
						++id;
					}
					this.selection.rangedSelect(id , id, true);
					return id;
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			// readjust view
			this._box.ensureRowIsVisible(Math.min(ids.shift(), this.rowCount - 1));
			SessionManager.savePositions();
		}
		catch (ex) {
			Debug.dump("Mover::down", ex);
		}	 
	}
};