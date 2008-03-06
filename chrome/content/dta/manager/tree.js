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
 
const FilePicker = Construct('@mozilla.org/filepicker;1', 'nsIFilePicker', 'init');
const ConverterOutputStream = Construct('@mozilla.org/intl/converter-output-stream;1', 'nsIConverterOutputStream', 'init');

DTA_include("common/verinfo.js");
 
var Tree = {
	_ds: Serv('@mozilla.org/widget/dragservice;1', 'nsIDragService'),
	
	init: function T_init(elem) {
		this.elem = elem;
		this._downloads = [];

		let as = Serv('@mozilla.org/atom-service;1', 'nsIAtomService');
		['iconic', 'completed', 'inprogress', 'paused', 'canceled', 'pausedUndetermined'].forEach(
			function(e) {
				this['_' + e] = as.getAtom(e);
			},
			this
		);
		this.elem.view = this;	
		
	},

	/*
	 * actual nsITreeView follows
	 */
	get rowCount() {
		return this._downloads.length;
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
		let d = this._downloads[idx];

		switch (col.index) {
			case 0: return Prefs.showOnlyFilenames ? d.destinationName : d.urlManager.usable;
			case 2: return d.percent;
			case 3: return d.dimensionString;
			case 4: return d.status;
			case 5: return d.is(RUNNING) ? d.speed : '';
			case 6: return d.parts;
			case 7: return d.mask;
			case 8: return d.destinationPath;
			case 9: return d.prettyHash;
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
		if (col.index == 1) {
			let d = this._downloads[idx]; 
			if (d.is(RUNNING, PAUSED) && !d.totalSize) {
				return 2; // PROGRESS_UNDETERMINED;
			}
			if (d.is(PAUSED) && d.partialSize / d.totalSize < .05) {
				return 2; // PROGRESS_UNDETERMINED;			
			}
			return 1; // PROGRESS_NORMAL;
		}
		return 3; // PROGRESS_NONE;
	},
	// will be called for cells other than textcells
	getCellValue: function T_getCellValue(idx, col) {
		if (col.index == 1) {
			let d = this._downloads[idx];
			if (d.is(CANCELED, COMPLETE)) {
				return 100; 
			}
			return d.totalSize ? d.partialSize * 100 / d.totalSize : 0;
		}
		return null;
	},
	getCellProperties: function T_getCellProperties(idx, col, prop) {
		if (col.index == 1) {
			let d = this._downloads[idx];
			switch (d.state) {
				case COMPLETE: prop.AppendElement(this._completed); return;
				case PAUSED:
					prop.AppendElement(this._paused);
					if (!d.totalSize || d.partialSize / d.totalSize < .05) {
						prop.AppendElement(this._pausedUndetermined);
					}
				return;
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
	
	// Drag and Drop stuff
	onDragStart: function T_onDragStart(evt, transferData, dragAction) {
		let data = new TransferDataSet();
		for (qi in this.selected) {
			var item = new TransferData();
			try {
				item.addDataForFlavour('text/x-moz-url', qi.urlManager.url + "\n" + qi.destinationName);
				item.addDataForFlavour("text/unicode", qi.urlManager.url);
				// this is fake, so that we know that we are we ;)
				item.addDataForFlavour('application/x-dta-position', qi.position);
				data.push(item);
			}
			catch (ex) {
				Debug.log("dnd failure", ex);	
			}
		}
		if (!data.first) {
			throw new Exception("nothing selected");
		}
		transferData.data = data;
	},
	canDrop: function T_canDrop() {
		let ds = this._ds.getCurrentSession();
		return ['text/x-moz-url', 'application/x-dta-position', 'text/unicode'].some(
			function(e) {
				return ds.isDataFlavorSupported(e);
			}
		);
	},
	drop: function T_drop(row, orientation) {
		if (!this.canDrop()) {
			throw new Exception("Invalid drop data!");
		}
		let ds = this._ds.getCurrentSession();
		if (ds.isDataFlavorSupported('application/x-dta-position')) {
			this._dropSelection(row, orientation);
		}
		else {
			this._dropURL(row, orientation);
		}
	},
	_dropSelection: function T__dropSelection(row, orientation) {
		try {
			this.beginUpdate();
			// means insert_after, so we need to adjust the row
			if (orientation == 1) {
				++row;
			}
			/* first we remove the dragged items from the list
			 * then we reinsert them
			 * if the dragged item is location before the drop position we need to adjust it (as we remove the item first)
			 * after we collected all items we simply reinsert them and invalidate our list.
			 * This might not be the most performant way, but at least it kinda works ;)
			 */
			downloads = this._getSelectedIds(true).map(
				function(id) {
					let qi = this._downloads[id];
					if (id < row) {
						--row;
					}
					this._downloads.splice(id, 1);
					return qi;					
				},
				this
			);
			downloads.forEach(
				function(qi) {
					this._downloads.splice(row, 0, qi);
				},
				this
			);
			
			this.endUpdate();
			this.invalidate();
			this._box.ensureRowIsVisible(Math.max(row, 0));
			this.selection.rangedSelect(row, row + downloads.length - 1, true);
			SessionManager.savePositions();
		}
		catch (ex) {
			Debug.log("_dropSelection", ex);
		}		
	},
	_dropURL: function T__dropURL(row, orientation) {
		// give control to our default DTA drop handler
		let evt = {
			target: document.documentElement,
			stopPropagation: function() {}
		};
		nsDragAndDrop.drop(evt, DTA_DropDTA); 
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
	removeWithConfirmation: function T_removeWithConfirmation() {
		if (Prefs.confirmRemove) {
			let res = DTA_confirm(_('removetitle'), _('removequestion'), DTA_confirm.YES, DTA_confirm.NO, null, 0, false, _('removecheck'));
			if (res.checked) {
				Preferences.setDTA('confirmremove', false);
			}
			if (res.button) {
				return;
			}
		}
		this.remove(null, true);
	},
	remove: function T_remove(downloads, performJump) {
		if (downloads && !(downloads instanceof Array)) {
			downloads = [downloads];
		}
		else if (!downloads) {
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
		if (performJump) {
			this._removeJump(downloads.length, last);
		}
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
		this.endUpdate();	
		if (delta == this._downloads.length) {
			return;
		}
		this.selection.clearSelection();
		this.invalidate();		
		this._removeJump(delta - this._downloads.length, last);
		SessionManager.savePositions();		
	},
	_removeJump: function(delta, last) {
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
					d.queue();
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
		this.selectionChanged();
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
				d.queue();
				Dialog.run(d);
			}
		}
	},
	export: function T_export() {
		try {
			if (!this._export()) {
				throw new Exception("Cannot export");
			}
		}
		catch (ex) {
			Debug.log("Cannot export downloads", ex);		
			DTA_alert(_('exporttitle'), _('exportfailed'));
		}
	},
	_export: function T_export() {
		let fp = new FilePicker(window, _('exporttitle'), Ci.nsIFilePicker.modeSave);
		fp.appendFilters(Ci.nsIFilePicker.filterHTML | Ci.nsIFilePicker.filterText);
		fp.appendFilter(_('filtermetalink'), '*.metalink');
		fp.defaultExtension = "metalink";
		fp.filterIndex = 2;
		
		let rv = fp.show();
		if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace) {
			switch (fp.filterIndex) {
				case 0: return this._exportHTML(fp.file);
				case 1: return this._exportText(fp.file);
				case 2: return this._exportMetalink(fp.file);
			} 
		}
		return false;
	},
	_exportHTML: function T__exportHTML(file) {
		// do not localize?!
		let title = "DownThemAll: exported on " + (new Date).toUTCString();
		
		let doctype = document.implementation.createDocumentType('html', '-//W3C//DTD XHTML 1.0 Strict//EN', 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd');
		let doc = document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', doctype);
		let root = doc.documentElement;
		
		{
			let head = doc.createElement('head');
			
			let n = doc.createElement('title');
			n.textContent = title;
			head.appendChild(n);
			
			n = doc.createElement('meta')
			n.setAttribute('http-equiv', 'content-type');
			n.setAttribute('content', 'application/xhtml+xml;charset=utf-8');
			head.appendChild(n);
			
			n = doc.createElement('link');
			n.setAttribute('rel', 'stylesheet');
			n.setAttribute('type', 'text/css');
			n.setAttribute('href', 'chrome://dta/skin/common/exporthtml.css');
			head.appendChild(n);
			
			root.appendChild(head);
		}
		{
			let addDesc = function(key, value, element) {
				let div = doc.createElement('div');
				
				div.appendChild(doc.createTextNode(key + ": "));
				
				let b = doc.createElement('strong');
				b.textContent = value;
				div.appendChild(b);
				
				element.appendChild(div);				
			};
		
		
			let body = doc.createElement('body');
			
			let n = doc.createElement('h1');
			n.textContent = title;
			body.appendChild(n);
			
			let list = doc.createElement('ol');
			for (let d in this.selected) {
				let url = d.urlManager.url;
				if (d.hash) {
					url += '#hash(' + d.hash.type + ":" + d.hash.sum + ")";
				}
				let desc = d.description;
				if (!desc) {
					desc = d.fileName;
				}
				let li = doc.createElement('li');

				let div = doc.createElement('div');
				n = doc.createElement('a');
				n.setAttribute('href', url);
				n.textContent = desc;
				div.appendChild(n);
				li.appendChild(div);
				
				addDesc('URL', d.urlManager.usable, li);
				if (d.referrer) {
					addDesc('Referrer', d.referrer.spec, li);				
				}
				if (d.hash) {
					addDesc(d.hash.type, d.hash.sum.toLowerCase(), li);
				}					
				list.appendChild(li);
			}			
			body.appendChild(list);
			
			let foot = doc.createElement('p');
			foot.appendChild(doc.createTextNode('Exported by '));
			n = doc.createElement('a');
			n.setAttribute('href', 'http://www.downthemall.net/');
			n.textContent = 'DownThemAll! ' + DTA_VERSION;
			foot.appendChild(n);
			body.appendChild(foot);		
			
			root.appendChild(body);
		}
		

		let fs = new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0);
		new XMLSerializer().serializeToStream(doc, fs, 'utf-8');
		fs.close();
		return true;		
	},
	// i.e. one url per line
	// exports hash fragments as well.
	_exportText: function T__exportText(file) {
		let cs = ConverterOutputStream(
			new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0),
			null,
			0,
			null
		);
		for (let d in this.selected) {
			let url = d.urlManager.url;
			if (d.hash) {
				url += '#hash(' + d.hash.type + ":" + d.hash.sum + ")";
			}
			url += "\r\n";
			cs.writeString(url); 
		}
		cs.close();
		return true;
	},
	_exportMetalink: function T__exportMetalink(file) {
		let doc = document.implementation.createDocument(NS_METALINKER, 'metalink', null);
		let root = doc.documentElement;
		root.setAttribute('type', 'static');
		root.setAttribute('version', '3.0');
		root.setAttribute('generator', 'DownThemAll! ' + DTA_VERSION + ' <http://downthemall.net/>');
		root.setAttributeNS(NS_DTA, 'version', DTA_VERSION);
		root.setAttribute('pubdate', new Date().toUTCString());
		
		root.appendChild(doc.createComment("metalink as exported by DownThemAll!\r\nmay contain DownThemAll! specific information in the DownThemAll! namespace: " + NS_DTA));  
		
		let files = doc.createElement('files');
		for (let d in this.selected) {
			let f = doc.createElement('file');
			f.setAttribute('name', d.fileName);
			f.setAttributeNS(NS_DTA, 'num', d.numIstance);
			f.setAttributeNS(NS_DTA, 'startDate', d.startDate.getTime());
			if (d.referrer) {
				f.setAttributeNS(NS_DTA, 'referrer', d.referrer.spec);
			}
			
			if (d.description) {
				let n = doc.createElement('description');
				n.textContent = d.description;
				f.appendChild(n);
			} 
			let r = doc.createElement('resources');
			for (let u in d.urlManager.all) {
				let n = doc.createElement('url');
				let t = u.url.match(/^(\w+):/);
				n.setAttribute('type', t[1]);
				n.setAttribute('preference', u.preference);
				n.setAttributeNS(NS_DTA, 'usable', u.usable);
				n.setAttributeNS(NS_DTA, 'charset', u.charset);
				n.textContent = u.url;
				r.appendChild(n);
			}
			if (d.hash) {
				let v = doc.createElement('verification');
				let h = doc.createElement('hash');
				h.setAttribute('type', d.hash.type.toLowerCase());
				h.textContent = d.hash.sum.toLowerCase();
				v.appendChild(h);
				f.appendChild(v);
			}
			f.appendChild(r);
			
			if (d.totalSize > 0) {
				let s = doc.createElement('size');
				s.textContent = d.totalSize;
				f.appendChild(s);
			}
			
			files.appendChild(f);
			
		}
		root.appendChild(files);
		
		let fs = new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0);
		let xml = '<?xml version="1.0"?>\r\n';
		fs.write(xml, xml.length);
		new XMLSerializer().serializeToStream(doc, fs, 'utf-8');
		fs.close();
		
		return true;
	},
	import: function T_import() {
		try {
			if (!this._import()) {
				throw new Exception("Cannot import");
			}
		}
		catch (ex) {
			Debug.log("Cannot import downloads", ex);		
			DTA_alert(_('importtitle'), _('importfailed'));
		}
	},
	_import: function T_import() {
		let fp = new FilePicker(window, _('importtitle'), Ci.nsIFilePicker.modeOpen);
		fp.appendFilters(Ci.nsIFilePicker.filterText);
		fp.appendFilter(_('filtermetalink'), '*.metalink');
		fp.defaultExtension = "metalink";
		fp.filterIndex = 1;
		
		let rv = fp.show();
		if (rv == Ci.nsIFilePicker.returnOK) {
			switch (fp.filterIndex) {
				case 0: return this._importText(fp.file);
				case 1: return this._importMetalink(fp.file);
			} 
		}
		return false;	
	},
	_importText: function T__importText() {
	
	},
	_importMetalink: function T__importMetalink(file) {
		try {
			DTA_include("dta/manager/metalinker.js");
			Metalinker.handleFile(file);
			return true;
		}
		catch (ex) {
			Debug.log("T__importMetalink", ex);
		}	
		return false;
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
	_hoverItem: null,
	_ww: Serv('@mozilla.org/embedcomp/window-watcher;1', 'nsIWindowWatcher'),
	hovering: function(event) {
		if (!Prefs.showTooltip || this._ww.activeWindow != window) {
			return;
		}
		this._hoverItem = {x: event.clientX, y: event.clientY};
	},
	showTip: function(event) {
		if (!Prefs.showTooltip || !this._hoverItem || this._ww.activeWindow != window) {
			return false;
		}
		let row = {};
		this._box.getCellAt(this._hoverItem.x, this._hoverItem.y, row, {}, {});
		if (row.value == -1) {
			return false;
		}
		let d = this.at(row.value);
		if (!d) {
			return false;
		}
		$("infoIcon").src = d.largeIcon;
		$("infoURL").value = d.urlManager.url;
		$("infoDest").value = d.destinationFile;
	
		Tooltip.start(d);			
		return true;
	},	
	stopTip: function T_stopTip() {
		Tooltip.stop();
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
				is: QueueItem.prototype.is,
				count: this.selection.count
			};
			for (let d in this.selected) {
				states.state |= d.state;
				states.resumable |= d.resumable;
			}
			let cur = this.current;
			states.curFile = (cur && cur.is(COMPLETE) && (new FileFactory(cur.destinationFile)).exists());
			states.curFolder = (cur && (new FileFactory(cur.destinationPath)).exists());
							
			function modifySome(items, f) {
				let disabled;
				if (empty) {
					disabled = true;
				}
				else {
					disabled = !f(states);
				}
				if (!(items instanceof Array)) {
					items = [items];
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
			modifySome($('launch'), function(d) { return d.curFile; });
			modifySome($('folder'), function(d) { return d.curFolder; });
			modifySome($('delete'), function(d) { return d.is(COMPLETE); });
			modifySome($('export'), function(d) { return d.count != 0; });
			modifySome($('addchunk', 'removechunk', 'force'), function(d) { return d.is(QUEUED, RUNNING, PAUSED); });
		}
		catch (ex) {
			Debug.log("rt", ex);
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
	// get the first selected item, NOT the item which has the input focus.
	get current() {
		let select = this.selection;
		try {
			let ci = {value: -1};
			this.selection.getRangeAt(0, ci, {});			
			if (ci.value > -1 && ci.value < this.rowCount) {
				return this._downloads[ci.value];
			}
		}
		catch (ex) {
			// fall-through
		}
		return null;		
	},
	// get the currently focused item.
	get focused() {
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
		SessionManager.beginUpdate();
		for (d in this.selected) {
			if (!f.call(t, d)) {
				break;
			}
		}
		SessionManager.endUpdate();
		this.endUpdate();
	},
	updateAll: function T_updateAll(f, t) {
		this.beginUpdate();
		SessionManager.beginUpdate();
		for (d in this.all) {
			if (!f.call(t, d)) {
				break;
			}
		}
		SessionManager.endUpdate();
		this.endUpdate();
	},
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
			Debug.log("Mover::top", ex);
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
			Debug.log("Mover::bottom", ex);
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
			Debug.log("Mover::up", ex);
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
			Debug.log("Mover::down", ex);
		}	 
	}
};