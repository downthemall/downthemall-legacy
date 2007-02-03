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
		var e = DTA_FilterManager.enumAll();
		var i=0;
		while (e.hasMoreElements()) {
			if (idx==i) 
				return e.getNext().QueryInterface(Components.interfaces.dtaIFilter);
			e.getNext();
			i++;
		}
		return null;
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
		if (this._box) {
			this._box.invalidate();
		}
	}
};


var Dialog = {
	load: function DTA_load() {
		strbundle = $("strings");
		$("filterTable").view = filterTree;
		$("filterText", "filterImage", "filterIsRegex").forEach(function(a){a.addEventListener("CheckboxStateChange", Dialog.onFilterEdit, false);});
	},
	onTableSelectionChange: function() {
		var idx = $("filterTable").currentIndex;
		var currentFilter = filterTree.getFilter(idx);
		$("filterLabel").value = currentFilter.label;
		$("filterTest").value = currentFilter.test;
		$("filterIsRegex").checked = currentFilter.isRegex;
		$("filterText").checked = currentFilter.type & 1;
		$("filterImage").checked = currentFilter.type & 2;
	},
	onFilterEdit: function() {
		var idx = $("filterTable").currentIndex;
		var currentFilter = filterTree.getFilter(idx);
		currentFilter.label = $("filterLabel").value;
		currentFilter.test = $("filterTest").value;
		currentFilter.isRegex = $("filterIsRegex").checked;
		currentFilter.type = ($("filterText").checked?1:0) + ($("filterImage").checked?2:0);
		currentFilter.save();
		$("filterTable").view = filterTree;
	}
};


// Crea il set delle 4 preferenze che caratterizzano un filtro e lo aggiunge allo xul (con crea vero, crea un nuovo filtro, con falso carica il primo filtro disponibile)

function addFilterPreference(i, preferenceIndex) { 
	
}

// aggiunge l'elemento all'albero e lo seleziona
function addItemToList(i) { 
	
} 

// crea un nuovo filtro da zero: senza parametri assegna quelli di default
function addNewFilter(filterName,filterDefinition,isChecked,isLink,isImage) {

}

// quando seleziono un elemento del tree, aggiorno i text e checkbox con i dati relativi al filtro selezionato
function changeSelection() {

}

// imposta i valori specificati (o in assenza quelli di default) alla preferenza i
function addDefaultValues(i,filterName,filterDefinition,isChecked,isLink,isImage) {

}

// elimina il filtro selezionato o specificato
function deleteFilter(i) {

}

// cambia la caption del filtro nell'albero, al cambiamento della relativa textbox
function changeCaption() {

}

// cambia il contenuto del filtro nell'albero, al cambiamento della relativa textbox
function changeExt() {

}

// elimina tutti i filtri e imposta quelli di default
function resetFilters() {

}

// imposta il filtro attutale come regex
function makeRegex() {

}

// verifica se il filtro selezionato è uan regEx
function isRegex() {

}

// disabilita i text e checkbox
function disableWriting() {

}

function enableWriting() {

}
