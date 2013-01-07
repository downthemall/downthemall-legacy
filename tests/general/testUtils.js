module("utils.js");

test("exports", function() {
	checkExports("utils", [
		"MimeQuality",
		"NS_DTA",
		"NS_HTML",
		"NS_XUL",
		"Properties",
		"SimpleIterator",
		"StringBundles",
		"filterInSitu",
		"filterMapInSitu",
		"formatNumber",
		"formatTimeDelta",
		"getTimestamp",
		"hexdigest",
		"launch",
		"mapFilterInSitu",
		"mapInSitu",
		"naturalSort",
		"newUUIDString",
		"normalizeMetaPrefs",
		"range",
		"reveal"
		]);
});


test("naturalSort", function() {
	const {naturalSort} = require("utils");
	deepEqual(
		naturalSort(["0x01", "0x02", "0xaf", "10x01", "9x01", "-10", "-1", "1", "01", "001", "0001", "0000001", "0000000001", "0000000000001", "000000000000000000001", "01", "0000000000001", "10", "2", "hallow-1", "hallow1", "hallow10", "hallow-10", "hallow2", "hallow-1foo", "hallow1foo", "hallow109xfoo", "hallow109", "hallow109", "hallow109zfoo", "hallow10zfoo", "hallow10foobar", "hallow10foo", "hallow-10foo", "hallow2foo", "bar-1foo", "BAR0foo", "bar1foo", "bar10foo", "bar-10foo", "bar101foo", "bar100foo", "bar200foo", "bar20foo", "bar2foo", "44", "44 (1)", "44 (2)", "44 (3)", "44(4)", "44(5)", "z24", "z2", "z15", "z1", "z3", "z20", "z5", "z11", "z 21", "z22"]),
		["-10", "-1", "1", "01", "01", "001", "0x01", "0001", "0000001", "0000000001", "0000000000001", "0000000000001", "000000000000000000001", "2", "0x02", "9x01", "10", "10x01", "0xaf", "44", "44 (1)", "44 (2)", "44 (3)", "44(4)", "44(5)", "BAR0foo", "bar1foo", "bar-1foo", "bar2foo", "bar10foo", "bar-10foo", "bar20foo", "bar100foo", "bar101foo", "bar200foo", "hallow-10", "hallow-1", "hallow1", "hallow1foo", "hallow-1foo", "hallow2", "hallow2foo", "hallow10", "hallow10foo", "hallow10foobar", "hallow10zfoo", "hallow-10foo", "hallow109", "hallow109", "hallow109xfoo", "hallow109zfoo", "z1", "z2", "z3", "z5", "z11", "z15", "z20", "z 21", "z22", "z24"]
		);
});

test("MimeQuality", function() {
	const {MimeQuality} = require("utils");
	var m = new MimeQuality();
	m.add("a", 0.5);
	m.add("b", 0.1);
	m.add("c", 1.0);
	m.add("x", 0.105);
	m.add("y", 0.100005);
	m.add("z", 0.1005);
	throws(function() m.add("d", 1.1));
	throws(function() m.add("e", -0.1));
	throws(function() m.add("f", -3));
	throws(function() m.add("g", 1 / 0));
	strictEqual(m.toString(), "c,a;q=0.5,x;q=0.105,b;q=0.1,y;q=0.1,z;q=0.1");
})

test("normalizeMetaPrefs", function() {
	const {normalizeMetaPrefs} = require("utils");
	var vec = [{preference: 100}, {preference: 99}, {preference: -3}, {preference: 500}, {preference: 10}];
	normalizeMetaPrefs(vec);
	arrayEqual(vec.map(function(e) e.preference), [10,100,80,80,97]);
});
