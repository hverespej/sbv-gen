var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));

console.log('Working...');
fs.readFileAsync('raw-transcript.txt', 'utf8').then(function(text) {
	// Format text
	var formatted = text.replace(/^(\w+):/gm,	function(match, p1) {
		return '[' + p1 + ']';
	});
	return formatted.replace(/\s+/g, ' ');
}).then(function(text) {
	// Tokenize
	var marked = text.replace(/[^\.]([\.!?]|\.")\s/g, function(match) {
		return match + '|';
	});
	return marked.split('|');
}).then(function(sentences) {
	var maxChars = 110;
	var groups = groupSentences(sentences, maxChars);
	// Run a second time to better converge
	groups = groupSentences(groups, maxChars);
	return groups;
}).then(function(groups) {
	var tsRegexp = new RegExp(/\[(\d\d:\d\d:\d\d)\]/);
	var timeframes = [];
	groups.forEach(function(item) {
		var m = item.match(tsRegexp);
		if (m === null) {
			timeframes.push([-1, item]);
		} else {
			timeframes.push([timestampToMs(m[1]), item.replace(tsRegexp, '')]);
		}
	});
	return timeframes;
}).then(function(timeframes) {
	if (timeframes[0][0] === -1) {
		timeframes[0][0] = 0;
	}

	var start = 0;
	var end = 1;
	var startTime = 0;
	var increment = 5000;
	while (end < timeframes.length) {
		startTime = timeframes[start][0];
		var endTime = timeframes[end][0];
		if (endTime !== -1) {
			var count = end - start;
			var diffTime = endTime - startTime;
			increment = Math.floor(diffTime / count);
			for (var i = 1; i < count; i++) {
				timeframes[start + i][0] = startTime + (i * increment);
			}
			start = end;
		}
		end++;
	}
	for (var i = 1; start + i < timeframes.length; i++) {
		timeframes[start + i][0] = startTime + (i * increment);
	}

	return timeframes;
}).then(function(timeframes) {
	var text = '';
	for (var i = 0; i < timeframes.length; i++) {
		// Handle running off end of array
		var endMs = i < timeframes.length - 1 ?
			timeframes[i+1][0] : 
			timeframes[i][0] + 5000;

		text += msToTimestamp(timeframes[i][0]) + ',' + msToTimestamp(endMs) + '\r\n' +
			timeframes[i][1] + '\r\n\r\n';
	}
	return text;
}).then(function(text) {
	return fs.writeFileAsync('output.sbv', text, 'utf8');
}).then(function(result) {
	console.log('Done!');
});

function groupSentences(sentences, maxChars) {
	var sentenceGroups = [''];
	for (var i = 0, j = 0; i < sentences.length; i++) {
		if (sentenceGroups[j].length + sentences[i].length < maxChars) {
			sentenceGroups[j] += sentences[i];
		} else {
			var fragments = breakSentence(sentences[i], maxChars);
			sentenceGroups = sentenceGroups.concat(fragments);
			j += fragments.length;
		}
	}
	return sentenceGroups;
}

function breakSentence(sentence, maxChars) {
	var results = [];

	var searchStr = sentence;
	while (searchStr.length > maxChars) {

		var breakPoint = searchStr.lastIndexOf('... ', maxChars - 1);
		if (breakPoint >= 0 && breakPoint + 3 < maxChars) {
			breakPoint += 3;
		} else {
			breakPoint = searchStr.lastIndexOf('," ', maxChars - 1);
			if (breakPoint >= 0 && breakPoint + 2 < maxChars) {
				breakPoint += 2;
			} else {
				breakPoint = searchStr.lastIndexOf('; ', maxChars - 1);
				if (breakPoint >= 0 && breakPoint + 1 < maxChars) {
					breakPoint += 1;
				} else {
					breakPoint = searchStr.lastIndexOf(', ', maxChars - 1);
					if (breakPoint >= 0 && breakPoint + 1 < maxChars) {
						breakPoint += 1;
					} else {
						breakPoint = searchStr.lastIndexOf(' ', maxChars - 1);
					}
				}
			}
		}

		if (breakPoint < 0) {
			throw new Error('No break found in string: ' + sentence);
		}

		results.push(searchStr.substring(0, breakPoint + 1));
		searchStr = searchStr.substring(breakPoint + 1);
	}
	results.push(searchStr);

	return results;
}

var msSeconds = 1000;
var msMinutes = 60 * msSeconds;
var msHours = 60 * msMinutes;

function timestampToMs(ts) {
	var ms = 0;

	var parts = ts.match(/(\d\d):(\d\d):(\d\d)/);
	ms += msHours * parseInt(parts[1]);
	ms += msMinutes * parseInt(parts[2]);
	ms += msSeconds * parseInt(parts[3]);

	var millis = ts.match(/\.(\d\d\d)/);
	if (millis !== null) {
		ms += parseInt(millis[1]);
	}

	return ms;
}

function msToTimestamp(ms) {
	var remaining = ms;

	var hours = Math.floor(remaining / msHours);
	var remaining = remaining % msHours;

	var minutes = Math.floor(remaining / msMinutes);
	var remaining = remaining % msMinutes;

	var seconds = Math.floor(remaining / msSeconds);
	var remaining = remaining % msSeconds;

	var millis = remaining;

	return ('00' + hours).slice(-2) + ':' 
		+ ('00' + minutes).slice(-2) + ':' 
		+ ('00' + seconds).slice(-2) + '.'
		+ ('000' + millis).slice(-3);
}

