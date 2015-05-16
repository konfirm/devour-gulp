# devour
Wrapper for gulp projects to provide a lot of syntactic sugar and re-use

## Install
```
npm install --save-dev devour
```

## Concept
`Devour` provides a thin wrapper for gulp, enabling the use of tasks and pipes defined in separate files.
All of the files will be loaded when `devour` is activated, then you specify which tasks should be build and whether or not to watch for changes.

## Usage
As `devour` is designed to incorporate `gulp`, you simply include it in your (existing) `gulpfile.js`, it will not get in the way of your current tasks (as long as there are no task-name collisions, of course).

### `gulpfile.js`
As `devour` is based on the concept of moving tasks into separate files, you (should) end up with a very clean `gulpfile.js`.

#### Without `devour`
Considering this example based on a normal (rather simple) `gulpfile.js`
```js
var gulp = require('gulp'),
	concat = require('gulp-concat'),
	uglify = require('gulp-uglify'),
	minifycss = require('gulp-minify-css'),
	rename = require('gulp-rename');

gulp.task('combine_script', function() {
	gulp.src('./src/**/*.js')
		.pipe(concat())
		.pipe(rename(function(file) {
			file.basename = 'combine';
		}))
		.pipe(gulp.dest('./dist'))
		.pipe(uglify())
		.pipe(rename(function(file) {
			file.basename += '.min';
		}))
		.pipe(gulp.dest('./dist'))
	;
});

gulp.task('combine_style', function() {
	gulp.src('./src/**/*.css')
		.pipe(concat())
		.pipe(rename(function(file) {
			file.basename = 'combine';
		}))
		.pipe(gulp.dest('./dist'))
		.pipe(minifycss())
		.pipe(rename(function(file) {
			file.basename += '.min';
		}))
		.pipe(gulp.dest('./dist'))
	;
});

gulp.task('watch', function() {
	gulp.watch('./src/**/*.js', ['combine_script']);
	gulp.watch('./src/**/*.css', ['combine_style']);
});

gulp.task('default', ['combine_script', 'combine_style', 'watch']);
```

#### With `devour`
Now, let's move those parts around into a bunch of separate files

First, create a named "pipe", which is basically a plugin within your project
```js
// file: gulp/pipe/combine.js
//  concatenate the input stream into a single file and name it combine.<extension>
//  this works the same for both javascript and stylesheets
module.exports = function(stream, devour) {
	return stream
		.pipe(devour.plugin('concat'))
		.pipe(devour.plugin('rename', function(file) {
			file.basename = 'combine';
		}))
		//  write the minified sources to the predefined destination
		.pipe(devour.write())
	;
};
```

Now create the tasks, one for javascripts (`gulp/task/script.js`) and one for stylesheets (`gulp/task/style.js`).
```js
// file: gulp/task/script.js
//  concatenate scripts into a single file and uglify it
module.exports = function(stream, devour) {
	return stream
		//  call the named pipe 'combine'
		.pipe(devour.pipe('combine'))
		//  add some gulp plugins to do their magic
		.pipe(devour.plugin('uglify'))
		.pipe(devour.plugin('rename', devour.min))
		//  finally, write the minified sources to the predefined destination
		.pipe(devour.write())
	;
};
```

The task for stylesheets is similar, except it does not `uglify` but uses `minify-css`
```js
// file: gulp/task/script.js
//  concatenate stylesheets into a single file and minify it
module.exports = function(stream, devour) {
	return stream
		//  call the named pipe 'combine'
		.pipe(devour.pipe('combine'))
		//  add some gulp plugins to do their magic
		.pipe(devour.plugin('minify-css'))
		.pipe(devour.plugin('rename', devour.min))
		//  finally, write the minified sources to the predefined destination
		.pipe(devour.write())
	;
};
```

So, ready for the _grande finale_? Ok, here comes the gulpfile:
```js
//  file: gulpfile.js
var Devour = require('devour'),
	devour = new Devour(); //  using all the default settings by not providing any of our own

devour
	.task('script', ['./src/**/*.js'])
	.task('style', ['./src/**/*.css'])
	.start()
;
```

Your project structure now looks somewhat like this:
```
/gulp
  /pipe
     combine.js
  /task
     script.js
     style.js
 gulpfile.js
```

What did we just do exactly? We have moved pretty much eveything into separate files, these files all have a single job, be it a task or a re-usable pipe.
You may also have noticed that there where no more requires after `require('devour')`, this is because `devour` will take care of loading any plugin for you. _You still needs to add plugins to your project yourself!_.
