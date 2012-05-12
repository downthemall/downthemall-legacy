module("atoms.jsm");

/* XXX require
test("exports", function() {
	checkExports("resource://dta/support/atoms.jsm", [
		"Atoms",
		"iconicAtom",
		"completedAtom",
		"inprogressAtom",
		"pausedAtom",
		"canceledAtom",
		"pausedUndeterminedAtom",
		"pausedAutoretryingAtom",
		"verifiedAtom",
		"progressAtom"
		]);
});
*/

test("getAtoms", function() {
	var Atoms = new (glue2.require("support/atoms").Atoms)();
	ok(Atoms.getAtom("foobar"), "can get atom");
	strictEqual(Atoms.getAtom("foobar"), Atoms.getAtom("foobar"), "getting twice yields the same atom");
	equal(Atoms.getAtom("foobar").toString(), "foobar", "toString works");

	var Atoms2 = new (glue2.require("support/atoms").Atoms)();
	strictEqual(Atoms.getAtom("foobar"), Atoms2.getAtom("foobar"), "getting twice by different instances yields the same atom");
});
