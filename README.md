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

What did we just do exactly? We have moved everything into separate files, these files all have a single job, be it a task or a re-usable pipe.
You may also have noticed that there are no requires for the `gulp-<plugins>`, this is because `devour` will take care of loading any plugin for you. _You still needs to add plugins to your project yourself!_.

## API
### `Devour([object settings])`
During construction you can provide an object containing your override and/or additional settings.
The default settings are:
- `debounce`: (int) `100`, add a default debounce of 100ms when triggering a task from a watched change, this adds a slight delay to the build process, but in general should prevent unintended double takes
- `basePath`: (string), the current working directory. The basePath is prepended to anything with resembles a relative path (e.g. does not start with `/`)
- `gulpFiles`: (string) `'gulp'`. The directory (relative to `basePath` if not starting with `/`) where the tasks and pipes are located
- `output`: (string) `'dist'`. The directory (relative to `basePath` if not starting with `/`) where to write the output
- `verbose`: (bool-ish) `true`. Control the amount of informative output generated by Devour. Any `false`-ish value will keep the output to a minimum, any `true`-ish value will inform about tasks being available and/or scheduled, (int) `2` will add information about the tasks which started, (int) `3+` will add information about the (prepared) pipes being used.

There are additional options, which are not preconfigured:
- `defaults`: (array). And array containing the plugins you'd like to run on _every_ task. Use it for example to ensure you always have [`gulp-plumber`](https://www.npmjs.com/package/gulp-plumber) by providing `{"defaults":["plumber"]}`
- (You still need to ensure the plugins to be available for your project by adding them as development dependencies).

Upon initialization, devour will inform you about the available tasks and pipes, for example
```
Devour initialized
  - available tasks: <task>, <task>, <task>
  - available pipes: defaults, <pipe>, <pipe>, <pipe>
```

### `.gulp`
If you need to access the `gulp` instance under the hood, you can by using `devour.gulp`. It truly is gulp itself you can use it to configure manual tasks.

### `.task(string name, array build [, array watch])`
Schedules a task (loaded from the `gulp/task`-directory) to run on the set of files in `build`, the `watch` parameter is optional, if omitted the watch-list will be equal to the build-list. If there should be no watch configured, pass on (bool) `false`.
Any task can be directly invoked from the command line, just like when using `gulp` itself (note, if the watch is explicitly disabled, the only way to make the task run is by calling it from the commandline or by calling `.start()` after scheduling your tasks).
Each configured task will inform you about the way it was scheduled, for example:
```
Task <name> activated
  - build files: <path>, <path>
  - watch files: <path>, <path>, <path>
```

### `.start()`
If you want to register the scheduled tasks to the `'default'` task, you can do so by calling `.start()`. If running from the commandline with a specified task, just like `gulp` the default task will be skipped.

### `.source(mixed path)`
Basically being `gulp.src`, the `.source` method accepts the same arguments. What it does more is that it will pipe the source list through the default pipe.

### `.plugin(string name [, ... ])`
Don't like to scatter `require` all over the place, just use the `devour.plugin('plugin')` syntax in your tasks and pipes, this will take care of loading the plugins, as long as you've provided the plugins that is.

### `.pipe(string name)`
Like plugin, but this time call a named pipe (defined in `gulp/pipe/*.js`), use this to create recurring flows and call them from your tasks.

### `.config([string key, [, mixed otherwise ]])`
Obtain all (if no key provided) configuration values, or request the value of a specific key and if it resolves to `false`-ish, return the value provided in `otherwise`.
```js
var output = devour.config('output'),  //  'dist' by default
	myDefault = devour.config('unknown', 'hello world');  //  'unknown' does not exist, returns 'hello world'
```

### `.write([string relative [, object options ]])`
The equivalent of `gulp.dest`, meaning it will stream the contents into the file at hand. The optional (string) `relative` allows to indicate a path relative to the configured `output` path. The optional (object) `options` is passed along the write stream, so you can speficy the file mode or whether or not to read the stream.

### `.min(object file)`
A small courtesy function which takes a file object and cleans up any existing `.min` or `.prep` from the filename before ensuring the `.min` at the beginning of the extension.


## License
GPLv2 © [Konfirm](https://konfirm.eu)
