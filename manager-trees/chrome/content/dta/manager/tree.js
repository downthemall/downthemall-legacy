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
 
Tree = {
	init: function T_init(elem) {
		this.elem = elem;
		this._downloads = [];
		// atom cache. See getAtom
		this._atoms = {};
		this._iconic = this._as.getAtom('iconic');
		this._complete = this._as.getAtom('completed');
		this._inprogress = this._as.getAtom('inprogress');
		this._paused = this._as.getAtom('paused');
		this._canceled = this._as.getAtom('canceled');
		this.elem.view = this;	
		
	},

	// will use it quite often.
	// 'properties' need to be an atom.
	_as: Cc["@mozilla.org/atom-service;1"]
		.getService(Ci.nsIAtomService),

	// get atoms, but provide caching.
	// we have a limited set of atoms anyway, so we don't have to expect a huge cache.
	getAtom: function T_getAtom(str) {
		if (!(str in this._atoms)) {
			this._atoms[str] = this._as.getAtom(str);
		}
		return this._atoms[str];
	},

	/*
	 * actual nsITreeView follows
	 */
	get rowCount() {
		return this._downloads.length;
	},

	// used to initialize nsITreeview and provide the corresponding treeBoxObject
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
		let d = this._downloads[idx];

		switch (col.index) {
			case 0: return Prefs.showOnlyFilenames ? d.destinationName : d.urlManager.usable;
			case 1: return d.percent;
			case 3: return d.dimensionString;
			case 4: return d.status;
			case 5: return d.parts;
			case 6: return d.mask;
			case 7: return d.destinationPath;
			case 8: return d.speed;
		}
		return '';
	},

	isSorted: function T_isSorted() {
		// not sorted
		return false;
	},
	isContainer: function T_isContainer(idx) {
		// being a container means we got children... but we don't have any children because we're a list actually
		return false;
	},
	isContainerOpen: function T_isContainerOpen(idx) {
		return false;
	},
	isContainerEmpty: function T_isContainerEmpty(idx) {
		return false;
	},

	isSeparator: function T_isSeparator(idx) {
		// no separators
		return false;
	},

	isEditable: function T_isEditable(idx) {
		// and nothing is editable
		return true;
	},

	// will grab the "icon" for a cell.
	getImageSrc: function T_getImageSrc(idx, col) {
		switch (col.index) {
			case 0: return this._downloads[idx].icon;
		}
		return null;
	},

	getProgressMode : function T_getProgressMode(idx, col) {
		if (col.index == 2) {
			return Ci.nsITreeView.PROGRESS_NORMAL;
		}
		return Ci.nsITreeView.PROGRESS_NONE;
	},

	// will be called for cells other than textcells
	getCellValue: function T_getCellValue(idx, col) {
		if (col.index == 2) {
			let d = this._downloads[idx];
			if (d.is(CANCELED)) {
				return 100;	
			}
			return d.totalSize ? d.partialSize * 100 / d.totalSize : 0;
		}
		return null;
	},
	getCellProperties: function T_getCellProperties(idx, col, prop) {
		if (col.index == 2) {
			let d = this._downloads[idx];
			switch (d.state) {
				case COMPLETE: prop.AppendElement(this._complete); return;
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

	// just some stubs we need to provide anyway to provide a full nsITreeView
	cycleHeader: function T_cycleHeader(col, elem) {},
	selectionChanged: function() {},
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
	
	// stuff
	add: function T_add(download) {
		this._downloads.push(download);
		download._tid = this._downloads.length - 1;
		if (!this._updating) {
			this._box.rowCountChanged(download._tid, 1);
		}
	},
	
	// d = null -> selection, d = downloadE, d = array -> all in list
	remove: function T_remove(downloads) {
		
		if (downloads instanceof Array) {
			// map to the actual ids and sort them in descending(!) order.
			var ids = downloads.sort(function(a, b) { return b._tid - a._tid; });
		}
		else if (downloads) {
			var ids = [downloads];
		}
		else {
			var ids = this._getSelectedIds(true).map(
				function(idx) {
					return this._downloads[idx]; 
				},
				this
			);
		}
		sessionManager.beginUpdate();
		this.beginUpdate();
		ids.forEach(
			function(d) {
				// wipe out any info/tmpFiles
				if (!d.is(COMPLETE, CANCELED)) {
					d.cancel();
				}
				sessionManager.deleteDownload(d);
				this._downloads.splice(d._tid, 1);
				delete d._tid;
			},
			this
		);
		this.endUpdate();
		sessionManager.endUpdate();
		this.invalidate();
	},
	removeCompleted: function T_removeCompleted() {
		let list = [];
		for (let i = 0, e = this._downloads.length; i < e; ++i) {
			if (this._downloads[i].is(COMPLETE)) {
				list.push(this._downloads[i]);
			}
		}
		this.remove(list);
	},
	pause: function T_pause() {
		this.updateSelected(
			function(d) {
				if (d.is(QUEUED) || (d.is(RUNNING) && d.isResumable)) {
					d.setPaused();
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
	},
	selectInv: function T_selectInv() {
		for (let d in this.all) {
			this.selection.toggleSelect(d._tid);
		}
	},
	changeChunks: function T_changeChunks(increase) {
		function inc(d) {
			if (d.maxChunks < 10 && d.isResumable) {
					d.maxChunks++;
					d.resumeDownload();
			}
		};
		function dec(d) {
			if (d.maxChunks > 1) {
					d.maxChunks--;
			}			
		};
		Tree.updateSelected(increase ? inc : dec);
	},
	showInfo: function T_showInfo() {
		this.beginUpdate();
		let downloads = [];
		for (let d in Tree.selected) {
			downloads.push(d);
		}
		if (downloads.length) {
			window.openDialog("chrome://dta/content/dta/info.xul","_blank","chrome, centerscreen, dialog=no", downloads, this);			
		}
		this.endUpdate();
	},	
	refreshTools: function T_refreshTools() {
		if (this._updating) {
			return;
		}
		try {
			$('info', 'remove', 'movetop', 'moveup', 'movedown', 'movebottom', 'toolmovetop', 'toolmoveup', 'toolmovedown', 'toolmovebottom')
				.forEach(
					function(o) { return o.setAttribute('disabled', this.current); },
					this
				);
			
			function modifySome(items, f) {
				let disabled = false; 
				if (tree.current) {
					disabled = true;
				}
				else {
					for (let d in Tree.selected) {
						if ((disabled == f(d))) {
							break;
						}
					}
				}
				items.forEach(
					function(o) {
						o.setAttribute('disabled', disabled);
					}
				);
			}
			modifySome($('play', 'toolplay'), function(d) { return !d.is(COMPLETE, RUNNING, QUEUED); });
			modifySome($('pause', 'toolpause'), function(d) { return d.is(RUNNING) && d.isResumable || d.is(QUEUED); });
			modifySome($('cancel', 'toolcancel'), function(d) { return !d.is(CANCELED); });
			modifySome($('launch', 'folder', 'delete'), function(d) { return d.is(COMPLETE); });
			modifySome($('addchunk', 'removechunk'), function(d) { return d.is(QUEUED, RUNNING, PAUSED); });
		}
		catch (ex) {
			// no-op
		}
	},
	
	invalidate: function T_invalidate(d) {
		if (!d) {
			let complete = 0;
			this._downloads.forEach(
				function(e, i) {
					e._tid = i;
					if (e.isPrototypeOf(COMPLETE)) {
						complete++;
					}
				}
			);
			this._box.invalidate();
			this.refreshTools();
			Stats.completedDownloads = complete;			
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
		}
		else if ('_tid' in d) {
			this._box.invalidateRow(d._tid);
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
		let select = this.selection;
		// loop through the selection as usual
		for (let i = 0, e = select.getRangeCount(); i < e; ++i) {
			let start = {}, end = {};
			select.getRangeAt(i,start,end);
			for (let j = start.value, k = end.value; j <= k; ++j) {
				yield this._downloads[j];
			}
		}
	},
	// returns an ASC sorted array of IDs that are currently selected.
	_getSelectedIds: function T_getSelectedIds(getReversed) {
		var rv = [];
		let select = this.selection;
		// loop through the selection as usual
		for (let i = 0, e = select.getRangeCount(); i < e; ++i) {
				let start = {}, end = {};
				this.selection.getRangeAt(i, start, end);
				for (let j = start.value, k = end.value; j <= k; ++j) {
					rv.push(j);
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
		if (ci > -1 && ci < this.rowCount) {
			return this._downloads[ci];
		}
		return null;		
	},
	
	at: function T_at(idx) {
		return this._downloads[idx];
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
	
	top: function T_top() {
		try {
			this.beginUpdate();
			this._getSelectedIds(true).forEach(
				function(id, idx) {
					id = id + idx;
					this._downloads.unshift(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(0, ids.length - 1, true);			
		}
		catch (ex) {
			Debug.dump("Mover::top", ex);
		}	
	},
	bottom: function T_bottom() {
		try {
			this.beginUpdate();
			this._getSelectedIds().forEach(
				function(id, idx) {
					id = id - idx;
					this._downloads.push(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(this._downloads.length - ids.length, this._downloads.length - 1, true);			
		}
		catch (ex) {
			Debug.dump("Mover::bottom", ex);
		}	
	},
	up: function T_up() {
		try {
			this.beginUpdate();
			ids = this._getSelectedIds().forEach(
				function(id, idx) {
					if (id - idx != 0) {
						let tmp = this._downloads[id];
						this._downloads[id] = this._downloads[id - 1];
						this._downloads[id - 1] = tmp;
						--id;
					}
					this.selection.rangedSelect(id, id, true);						
				},
				this
			);
			this.endUpdate();
			this.invalidate();
		}
		catch (ex) {
			Debug.dump("Mover::up", ex);
		}		
	},
	down: function T_down() {
		try {
			this.beginUpdate();
			let rowCount = this.rowCount;
			this._getSelectedIds(true).forEach(
				function(id, idx) {
					if (id + idx != rowCount - 1) {
						let tmp = this._downloads[id];
						this._downloads[id] = this._downloads[id + 1];
						this._downloads[id + 1] = tmp;
						++id;
					}
					this.selection.rangedSelect(id , id, true);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			// readjust view
			let last = ids[0];
			if (last != this.rowCount - 1) {
				++last;
			}
			this._box.ensureRowIsVisible(last);
		}
		catch (ex) {
			Debug.dump("Mover::down", ex);
		}		
	}
};