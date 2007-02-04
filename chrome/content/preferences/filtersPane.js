/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *	Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */
 
var strbundle;

var filterTree = {
	reloadFilters: function() {
		try {
			var n = [];
			var e = DTA_FilterManager.enumAll();
			while (e.hasMoreElements()) {
				n.push(e.getNext().QueryInterface(Components.interfaces.dtaIFilter).id);
			}
			var index = $("filterTable").view.selection.currentIndex;
			if (index != -1 && n[index] != this._filterIDs[index]) {
				$("filterTable").view.selection.select(n.indexOf(this._filterIDs[index]));
			}
			this._filterIDs = n;
			this.invalidate();
			Dialog.onTableSelectionChange();
		} catch(e) {
			Debug.dump("reloadFilters(): ", e);
		}
	},
	get rowCount() {
		return DTA_FilterManager.count;
	},
	setTree: function(box) {
		this._box = box;
	},
	getParentIndex: function(idx) {
		return -1;
	},
	getLevel: function(idx) {
		return 0;
	},
	getFilter: function(idx) {
		if (idx==-1) {
			throw new Components.Exception("invalid index specified: " + idx);
		}
		return DTA_FilterManager.getFilter(this._filterIDs[idx]);
	},
	getCellText: function(idx, col) {
		switch (col.index) {
			case 0:
				return this.getFilter(idx).label;
			case 1:
				return this.getFilter(idx).test;
		}
		return null;
	},
	isSorted: function() {
		return false;
	},
	isContainer: function(idx) {
		return false;
	},
	isContainerOpen: function(idx) {
		return false;
	},
	isContainerEmpty: function(idx) {
		return false;
	},
	isSeparator: function(idx) {
		return false;
	},	
	isEditable: function(idx) {
		return false;
	},	
	getImageSrc: function(idx, col) {
		return null;
	},
	getProgressMode : function(idx,column) {
		
	},
	getCellValue: function(idx, column) {
		return false;
	},
	cycleHeader: function(col, elem) {},
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getRowProperties: function(idx, prop) {
		return;
	},
	getCellProperties: function(idx, column, prop) {
		return;
	},
	getColumnProperties: function(column, element, prop) {},
	setCellValue: function(idx, col, value) {
		return;
	},
	invalidate: function() {
		this._box.invalidate();
	}
};


var Dialog = {
	load: function DTA_load() {
		strbundle = $("strings");

		// load the filters for the first time
		$("filterTable").view = filterTree;
		filterTree.reloadFilters();
		
		$("filterText", "filterImage", "filterIsRegex").forEach(function(a){a.addEventListener("CheckboxStateChange", Dialog.onFilterEdit, false);});
	},
	onTableSelectionChange: function() {
		var idx = $("filterTable").view.selection.currentIndex;
		
		if (idx==-1) {
			$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex").forEach(function(a){a.disabled=true});
			$("filterLabel", "filterTest").forEach(function(a){a.value=""});
			$("filterText", "filterImage", "filterIsRegex").forEach(function(a){a.checked=false});
			return;
		}
		
		var currentFilter = filterTree.getFilter(idx);

		$("filterLabel").value = currentFilter.label;
		$("filterTest").value = currentFilter.test;
		$("filterIsRegex").checked = currentFilter.isRegex;
		$("filterText").checked = currentFilter.type & 1;
		$("filterImage").checked = currentFilter.type & 2;
		
		$("filterLabel", "filterTest", "filterText", "filterImage", "filterIsRegex").forEach(function(a){a.disabled=currentFilter.defFilter});
	},
	onFilterEdit: function(evt) {
		
		if (evt.type == "" && evt.currentTarget==("filterIsRegex")) {
			Debug.dump("eccoci");
		}
		
		var idx = $("filterTable").view.selection.currentIndex;
		var currentFilter = filterTree.getFilter(idx);
		
		if (idx==-1 || currentFilter.defFilter) {
			return;
		}

		if (
			$("filterLabel").value!=currentFilter.label 
			||
			$("filterTest").value!=currentFilter.test
			||
			currentFilter.isRegex!=$("filterIsRegex").checked
			||
			currentFilter.type!= ($("filterText").checked?1:0) + ($("filterImage").checked?2:0)
			)
		{
			currentFilter.label = $("filterLabel").value;
			currentFilter.test = $("filterTest").value;
			currentFilter.isRegex = $("filterIsRegex").checked;
			currentFilter.type = ($("filterText").checked?1:0) + ($("filterImage").checked?2:0);
			currentFilter.save();
			filterTree.reloadFilters();
		}
	},
	createFilter: function() {
		DTA_FilterManager.create(
			strbundle.getString("newfilt"), 
			strbundle.getString("inserthere"),
			false,
			1,
			false
		);
		filterTree.reloadFilters();
	},
	removeFilter: function() {
		var idx = $("filterTable").view.selection.currentIndex;
		
		if (idx==-1) return;
		if (filterTree.getFilter(idx).defFilter) return;
		
		var currentFilter = filterTree.getFilter(idx).remove();
		filterTree.reloadFilters();
		$("filterTable").view.selection.clearSelection();
	}
};
