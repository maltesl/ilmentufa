/*
 * CAMXES.JS POSTPROCESSOR
 * Created by Ilmen (ilmen.pokebip <at> gmail.com) on 2013-08-16.
 * Last change: 2016-10-09.
 * 
 * Entry point: camxes_postprocessing(input, mode)
 * Arguments:
 *    -- input: [array] camxes' parse tree output
 *    -- mode:  [number] output mode flag
 *         If mode > 7, displaying spaces is enabled and mode's value is
 *         truncated so mode <= 7. Then, depending on the value of mode,
 *         the following options are set:
 *         0 = Raw output (no change)
 *         1 = Condensed
 *         2 = Prettified
 *         3 = Prettified + selma'o
 *         4 = Prettified + selma'o + bridi parts
 *         5 = Prettified - famyma'o
 *         6 = Prettified - famyma'o + selma'o
 *         7 = Prettified - famyma'o + selma'o + bridi parts
 *         
 * Return value:
 *       [string] postprocessed version of camxes' output
 */

/*
 * Function list:
 *   -- camxes_postprocessing(text, mode)
 *   -- new_postprocessor(input, no_morpho, with_selmaho, with_terminator)
 *   -- prune_unwanted_nodes(tree, is_wanted_node)
 *   -- prefix_wordclass(tree, replacements)
 *   -- remove_morphology(pt)
 *   -- is_target_node(n)
 *   -- join_expr(n)
 *   -- among(v, s)
 *   -- is_selmaho(v)
 *   -- prettify_brackets(str)
 *   -- str_print_uint(val, charset)
 *   -- str_replace(str, pos, len, sub)
 *   -- chr_check(chr, list)
 *   -- is_string(v)
 *   -- is_array(v)
 */


if (typeof alert !== 'function')
    alert = console.log; // For Node.js

/*
 * Version of transition between the older string processing and the newer
 * parse tree processing.
 * The below function's content is temporary and allows choosing which of the
 * two postprocessor (the older, the newer or even both) to use.
 * If the new postprocessor proves satisfactory, the older postprocessor's code
 * will be entirely removed.
 */
function camxes_postprocessing(input, mode) {
    if (is_string(input)) input = JSON.parse(input);
    if (!is_array(input))
        return "Postprocessor error: invalid input type for the first argument. "
             + "It should be of type 'array', but the argument given is of type '" + typeof input + "'."
             + (is_string(input) ? "\n\nThe new postprocessor doesn't allow anymore string inputs. "
             + "Please check the parse tree produced by the parser hasn't been converted to string "
             + "before being passed to the postprocessor." : "");
    if (is_string(mode)) {
        var with_spaces       = among('S', mode);
        var with_morphology   = among('M', mode);
        var with_nodes_labels = among('N', mode);
        var with_selmaho      = among('C', mode);
        var with_terminators  = among('T', mode);
        var with_json_format  = among('J', mode);
     // var is_raw_output     = among('R', mode);
        if (among('R', mode)) mode = 1;
        else mode = 2;
    } else {
        if (!is_number(mode)) mode = 0;
        var with_spaces = mode & 8;
        var with_morphology = (mode & 16);
        mode = mode % 8;
        var with_selmaho = (mode != 2 && mode != 5);
        var with_nodes_labels = (mode == 4 || mode == 7);
        var with_terminators = (mode < 5);
        var with_json_format = false;
    }
    if (!with_morphology)
        input = remove_morphology(input); // Deleting morphology nodes.
    if (mode <= 1) {
        var output = JSON.stringify(input, undefined, mode == 0 ? 2 : 0);
    } else {
        input = new_postprocessor(input, with_morphology, with_spaces,
                                  with_selmaho, with_terminators,
                                  with_nodes_labels);
        var output = JSON.stringify(input);
    }
    if (mode <= 1 || with_json_format)
        return output;
    //alert(output);
    //output = output.replace(/( +\"|\" +)/gm, "__");
    output = output.replace(/\"/gm, "");
    output = output.replace(/,/gm, " ");
    // Replacing "spaces" with "_":
    output = output.replace(/([ \[\],])(initial_)?spaces(?=[ \[\],])/gm, "$1_");
    if (with_nodes_labels) {
        output = output.replace(/\[prenex /g, "[PRENEX: ");
        output = output.replace(/\[sentence /g, "[BRIDI: ");
        output = output.replace(/\[selbri /g, "[SELBRI: ");
        output = output.replace(/\[sumti /g, "[SUMTI: ");
    }
    // Bracket prettification:
    output = prettify_brackets(output);
	return output;
}


// ====== NEW POSTPROCESSOR ====== //

function new_postprocessor(
    input,
    with_morphology,
    with_spaces,
    with_selmaho,
    with_terminators,
    with_nodes_labels
) {
    var filter;
    var wanted_nodes = [];
    if (with_nodes_labels)
        wanted_nodes = wanted_nodes.concat(["prenex", "sentence", "selbri", "sumti"]);
    if (!with_morphology) {
        filter = function (v,b) { return (with_selmaho ?
                  among(v, wanted_nodes.concat(["cmevla", "gismu", "lujvo", "fuhivla"]))
                  || (is_selmaho(v) && (with_terminators || !b))
                  : among(v, wanted_nodes)
                  || (is_selmaho(v) && b && with_terminators)); };
    } else {
        filter = function (v,b) { return among(v, wanted_nodes) ||
                  (with_selmaho ? (is_selmaho(v) && (with_terminators || !b))
                  : is_selmaho(v) && b && with_terminators); };
    }
    input = prune_unwanted_nodes(input, filter, with_spaces);
    if (input === null) return [];
    if (with_selmaho && !with_morphology) {
        var replacements = [["cmene", "C"], ["cmevla", "C"], ["gismu", "G"],
            ["lujvo", "L"], ["fuhivla", "Z"]];
        input = prefix_wordclass(input, replacements);
        if (is_string(input)) input = [input];
    }
    return input;
}

function prune_unwanted_nodes(tree, is_wanted_node, with_spaces) {
    if (is_string(tree)) return tree;
    if (!is_array(tree)) throw "ERR";
    if (tree.length == 0) return null;
    if (tree[0] == "spaces" && tree.length > 0) {
        if (with_spaces) tree[1] = "_";
        else return null;
    }
    var no_label = is_array(tree[0]);
    var k = 0;
    var i = no_label ? 0 : 1;
    while (i < tree.length) {
        tree[i] = prune_unwanted_nodes(tree[i], is_wanted_node, with_spaces);
        if (tree[i]) {
            k++;
            i++;
        } else tree.splice(i, 1);
    }
    if (!no_label) {
        if (!is_wanted_node(tree[0], tree.length == 1)) tree.splice(0, 1);
        else k++;
    }
    if (k == 1) return tree[0];
    else return (k > 0) ? tree : null;
}

function prefix_wordclass(tree, replacements) {
    if (tree.length == 2 && is_string(tree[0]) && is_string(tree[1])) {
        var i = 0;
        while (i < replacements.length) {
            if (tree[0] == replacements[i][0]) {
                tree[0] = replacements[i][1];
                break;
            }
            i++;
        }
        return tree[0] + ':' + tree[1];
    }
    var i = 0;
    while (i < tree.length) {
        if (is_array(tree[i]))
            tree[i] = prefix_wordclass(tree[i], replacements);
        i++;
    }
    return tree;
}

function remove_spaces(tree) { // Unused
    if (tree.length > 0 && tree[0] == "spaces") return null;
    var i = 0;
    while (i < tree.length) {
        if (is_array(tree[i])) {
            tree[i] = remove_spaces(tree[i]);
            if (tree[i] === null) tree.splice(i, 1);
        }
        i++;
    }
    return tree;
}

// ====== MORPHOLOGY REMOVAL ====== //

/*
 * remove_morphology(parse_tree)
 * 
 * This function takes a parse tree, and joins the expressions of the following
 * nodes:
 * "cmevla", "gismu", "lujvo", "fuhivla", "spaces"
 * as well as any selmaho node (e.g. "KOhA").
 * 
 * (This is essentially a copy of remove_morphology.js.)
 */
 
function remove_morphology(pt) {
    if (pt.length < 1) return [];
    var i;
    /* Sometimes nodes have no label and have instead an array as their first
       element. */
    if (is_array(pt[0])) i = 0;
    else { // The first element is a label (node name).
        // Let's check if this node is a candidate for our pruning.
        if (is_target_node(pt)) {
            /* We join recursively all the terminal elements (letters) in this
             * node and its child nodes, and put the resulting string in the #1
             * slot of the array; afterwards we delete all the remaining elements
             * (their terminal values have been concatenated into pt[1]). */
            pt[1] = join_expr(pt);
            // If pt[1] contains an empty string, let's delete it as well:
            pt.splice((pt[1] == "") ? 1 : 2);
            return pt;
        }
        i = 1;
    }
    /* If we've reached here, then this node is not a target for pruning, so let's
       do recursion into its child nodes. */
    while (i < pt.length) {
        remove_morphology(pt[i]);
        i++;
    }
    return pt;
}

/* Checks whether the argument node is a target for pruning. */
function is_target_node(n) {
    return (among(n[0], ["cmevla", "gismu", "lujvo", "fuhivla", "spaces", "ga_clause", "gu_clause"])
            || is_selmaho(n[0]));
}


/* This function returns the string resulting from the recursive concatenation of
 * all the leaf elements of the parse tree argument (except node names). */
// "join_leaves" or "flatten_tree" might be better names.
function join_expr(n) {
    if (n.length < 1) return "";
    var s = "";
    var i = is_array(n[0]) ? 0 : 1;
    while (i < n.length) {
        s += is_string(n[i]) ? n[i] : join_expr(n[i]);
        i++;
    }
    return s;
}

function among(v, s) {
    var i = 0;
    while (i < s.length) if (s[i++] == v) return true;
    return false;
}

function is_selmaho(v) {
    if (!is_string(v)) return false;
    return (0 == v.search(/^[IUBCDFGJKLMNPRSTVXZ]?([AEIOUY]|(AI|EI|OI|AU))(h([AEIOUY]|(AI|EI|OI|AU)))*$/g));
}


/* ================== */
/* ===  Routines  === */
/* ================== */

function prettify_brackets(str) {
	var open_brackets = ["(", "[", "{", "<"];
	var close_brackets = [")", "]", "}", ">"];
	var brackets_number = 4;
//	var numset = ['0','1','2','3','4','5','6','7','8','9'];
	var numset = ['\u2070','\u00b9','\u00b2','\u00b3','\u2074',
	              '\u2075','\u2076','\u2077','\u2078','\u2079'];
	var i = 0;
	var floor = 0;
	while (i < str.length) {
		if (str[i] == '[') {
			var n = floor % brackets_number;
			var num = (floor && !n) ?
				str_print_uint(floor / brackets_number, numset) : "";
			str = str_replace(str, i, 1, open_brackets[n] + num);
			floor++;
		} else if (str[i] == ']') {
			floor--;
			var n = floor % brackets_number;
			var num = (floor && !n) ?
				str_print_uint(floor / brackets_number, numset) : "";
			str = str_replace(str, i, 1, num + close_brackets[n]);
		}
		i++;
	}
	return str;
}

function str_print_uint(val, charset) {
	// 'charset' must be a character array.
	var radix = charset.length;
	var str = "";
	val -= val % 1;  // No float allowed
	while (val >= 1) {
		str = charset[val % radix] + str;
		val /= radix;
		val -= val % 1;
	}
	return str;
}

function str_replace(str, pos, len, sub) {
	if (pos < str.length) {
		if (pos + len >= str.length) len -= pos + len - str.length;
		return str.substring(0, pos) + sub + str.substring(pos + len);
	} else return str;
}

function chr_check(chr, list) {
	var i = 0;
	if (!is_string(list)) return false;
	do if (chr == list[i]) return true; while (i++ < list.length);
	return false;
} // Currently unused.

function is_string(v) {
    return Object.prototype.toString.call(v) === '[object String]';
}

function is_array(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
}

function is_number(v) {
    return Object.prototype.toString.call(v) === '[object Number]';
}

if (typeof module !== 'undefined')
    module.exports.postprocessing = camxes_postprocessing;

