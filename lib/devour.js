'use strict';

/**
 *  Convenience layer around the gulp build system to provide an even more modulair/reusable build system
 */
function Devour(settings) {
	var devour = this,
		gulp = require('gulp'),
		glob = require('glob'),
		chalk = require('chalk'),
		submerge = require('submerge'),
		polymorphic = require('polymorphic'),
		chain = require('gulp-chain'),
		watcher = require('gulp-watch'),
		definitions = {},
		run = process.argv.splice(2),
		config = submerge(settings, {
			debounce: 100,
			basePath: process.cwd(),
			gulpFiles: 'gulp',
			output: 'dist',
			verbose: !run.length
		}),
		active = [];

	/**
	 *  Initialize Devour
	 *  @name    init
	 *  @access  internal
	 *  @return  void
	 */
	function init() {
		Object.defineProperty(devour, 'gulp', {
			enumerable: true,
			value: gulp
		});

		preload();
	}

	/**
	 *  Load all available tasks and pipes
	 *  @name    preload
	 *  @access  internal
	 *  @return  void
	 */
	function preload() {
		var path = config.gulpFiles;

		if (/^[^\/]/.test(path)) {
			path = config.basePath + '/' + path;
		}

		glob.sync(path + '/*/*.js').map(function(file) {
			return file.replace(path, '').split('/').filter(function(split) {
				return !!split;
			});
		}).forEach(function(file) {
			register(
				file[0],
				file[file.length - 1].replace(/\.js$/, ''),
				require(path + '/' + file.join('/'))
			);
		});

		console.log(chalk.cyan('Devour initialized'));

		if (config.verbose) {
			['task', 'pipe'].forEach(function(what) {
				console.log(
					'  - available %ss: %s',
					what,
					what in definitions ? chalk.green(Object.keys(definitions[what]).join(', ')) : chalk.yellow('none')
				);
			});
			console.log('');
		}
	}

	/**
	 *  Register a task or pipe
	 *  @name    resgister
	 *  @access  internal
	 *  @param   string type [accepts any value, actual values: 'task' or 'pipe']
	 *  @param   string name
	 *  @param   function create
	 *  @return  void
	 */
	function register(type, name, create) {
		if (!(type in definitions)) {
			definitions[type] = {};
		}

		if (type === 'pipe') {
			create = chain(create, devour);
		}

		definitions[type][name] = create;
	}

	/**
	 *  Obtain a gulp plugin, initialized with given arguments
	 *  @name    plug
	 *  @access  internal
	 *  @param   string  name [automatically prefixed with 'gulp-']
	 *  @return  stream  initialized plugin
	 */
	function plug(name) {
		var part, scope;

		if (!('buffer' in plug.prototype)) {
			plug.prototype.buffer = {};
		}

		part  = name.split('.');
		scope = part.shift();

		if (!(scope in plug.prototype.buffer)) {
			plug.prototype.buffer[scope] = require(process.cwd() + '/node_modules/gulp-' + scope);
		}

		scope = plug.prototype.buffer[scope];

		part.forEach(function(p) {
			scope = scope[p];
		});

		//  this may be an a-typical gulp plugin (e.g. sourcemaps) which provides no stream, the implementer probably
		//  knows what to do with this
		if (typeof scope !== 'function') {
			return scope;
		}

		//  invoke the function in the scope with the arguments after the name
		//  this should create a stream
		return scope.apply(null, Array.prototype.slice.call(arguments, 1))
			//  always register an error listener for plugins
			.on('error', function(error) {
				console.error('Error from plugin %s: %s', chalk.red(name), error);
				this.emit('end');
			})
		;
	}

	/**
	 *  Start tasks provided from the command line
	 *  @name    startRequested
	 *  @access  internal
	 *  @return  bool  started
	 */
	function startRequested() {
		var start = [];

		if (run.length) {
			run.forEach(function(task) {
				var exists = task.replace(/:.*$/, '') in definitions.task;

				console.log(
					'Task %s %s',
					exists ? chalk.green(task) : chalk.red(task),
					exists ? 'running' : 'not found!'
				);

				if (exists) {
					start.push(task);
				}
			});

			if (start.length) {
				gulp.start.apply(gulp, start.concat([function(error) {
					if (error) {
						throw new Error(error);
					}

					console.log('Complete');
				}]));
			}
			else {
				console.log(chalk.red('No tasks are running, exiting!'));
				process.exit(1);
			}
		}

		return !!start.length;
	}

	/**
	 *  Create a plugin and initialize it
	 *  @name    plugin
	 *  @access  public
	 *  @param   mixed   arguments
	 *  @return  stream
	 */
	devour.plugin = plug;

	/**
	 *  Cleanup file basename and append .min to it
	 *  @name    min
	 *  @access  public
	 *  @param   object  file
	 *  @return  void
	 */
	devour.min = function(file) {
		file.basename = file.basename.replace(/\.(?:min|prep)/, '') + '.min';
	};

	/**
	 *  Create a source list and pipe it through the 'defaults' pipe
	 *  @name    source
	 *  @access  public
	 *  @param   mixed sources [one of: string, array]
	 *  @return  stream
	 */
	devour.source = function() {
		var source = gulp.src.apply(gulp, arguments);

		if ('defaults' in config) {
			config.defaults.forEach(function(name) {
				source = source.pipe(devour.plugin(name));
			});
		}

		return source;
	};

	/**
	 *  Invoke the predefined pipe and return its stream
	 *  @name    pipe
	 *  @access  public
	 *  @param   string  pipe
	 *  @return  stream
	 */
	devour.pipe = function() {
		var arg = Array.prototype.slice.call(arguments),
			name = arg.shift();

		if ('pipe' in definitions && name in definitions.pipe) {
			if (+config.verbose > 2) {
				console.log('  - Laying pipe: %s', chalk.yellow(name));
			}

			return definitions.pipe[name].apply(null, [null].concat(arg))
				//  always register an error listener for pipes
				.on('error', function(error) {
					console.error('Error in pipe %s: %s', chalk.red(name), error);
					this.emit('end');
				})
			;
		}

		throw new Error('Named pipe not found: ' + name);
	};

	/**
	 *  Obtain all settings, a single setting or a default value
	 *  @name    config
	 *  @access  public
	 *  @param   string  key [optional, default undefined - return the entire configuration]
	 *  @param   mixed   otherwise
	 *  @return  mixed
	 */
	devour.config = function(value, otherwise) {
		return arguments.length ? config[value] || otherwise : config;
	};

	/**
	 *  Write the contents of the current stream into the file in the stream
	 *  @name    write
	 *  @access  public
	 *  @param   string  relative [optional, default undefined - the configured 'output' path]
	 *  @param   object  options  [optional, default undefined - no options]
	 *  @return  stream
	 */
	devour.write = function(relative, options) {
		var path = config.output;

		if (/^\//.test(relative)) {
			path = relative;
		}
		else {
			path += '/' + (relative || '');
		}

		return gulp.dest(path, options || {read:true});
	};

	/**
	 *  Schedule a task
	 *  @name    task
	 *  @access  public
	 *  @param   string  name
	 *  @param   mixed   build [one of: string, array]
	 *  @param   mixed   watch [optional, default true - the value of build, one of string, array, bool provide (bool) false to disable]
	 *  @return  devour  [chainable]
	 */
	devour.task = polymorphic();
	devour.task.signature(
		'string name, array build, array watch',
		function(name, build, watch) {
			if (config.verbose) {
				console.log(
					'Task %s activated\n  - build files: %s\n  - watch files: %s',
					chalk.cyan(name),
					chalk.yellow(build.join(chalk.white(', '))),
					watch.length ? chalk.yellow(watch.join(chalk.white(', '))) : chalk.red('(none, not watching)')
				);
			}

			gulp.task(name, function() {
				var start = process.hrtime();

				if (+config.verbose > 1) {
					console.log('Running task: %s', chalk.yellow(name));
				}

				return definitions.task[name.replace(/:.*$/, '')](
						build.length ? devour.source(build) : null,
						devour,
						name)
					.on('end', function() {
						var delta = process.hrtime(start);
						if (+config.verbose > 1) {
							console.log(
								'Completed task: %s (%s)',
								chalk.yellow(name),
								chalk.green((delta[0] * 1e3 + delta[1] / 1e6).toFixed(2) + 'ms')
							);
						}
					})
				;
			});

			if (!run.length && watch.length) {
				active.push(name);
				watcher(watch, function() {
					gulp.start(name);
				});

				// gulp.watch(watch, {debounceDelay: config.debounce}, [name]);
			}

			return devour;
		}
	);

	devour.task.signature(
		'string name, string build, array watch',
		function(name, build, watch) {
			return devour.task(name, [build], watch);
		}
	);
	devour.task.signature(
		'string name, array build, string watch',
		function(name, build, watch) {
			return devour.task(name, build, [watch]);
		}
	);
	devour.task.signature(
		'string name, string build, string watch',
		function(name, build, watch) {
			return devour.task(name, [build], [watch]);
		}
	);
	devour.task.signature(
		'string name, array build, bool watch=true',
		function(name, build, watch) {
			return devour.task(name, build, watch ? build : []);
		}
	);
	devour.task.signature(
		'string name, string build, bool watch=true',
		function(name, build, watch) {
			return devour.task(name, [build], watch ? [build] : []);
		}
	);
	devour.task.signature(
		'string name',
		function(name) {
			return devour.task(name, [], []);
		}
	);

	/**
	 *  Create a default task for all scheduled tasks and let gulp do the heavy lifting
	 *  @name    start
	 *  @access  public
	 *  @param   function callback [optional, default undefined - no callback]
	 *  @return  void
	 */
	devour.start = function(callback) {
		if (startRequested()) {
			return;
		}

		if (!gulp.hasTask('default')) {
			if (config.verbose) {
				console.log(
					'\nNo %s task found, creating it with tasks: %s',
					chalk.cyan('default'),
					active.length ? chalk.cyan(active.join(chalk.white(', '))) : chalk.red('(none)')
				);
			}

			gulp.task('default', active, callback);

			console.log(
				'Created %s task: %s',
				chalk.cyan('default'),
				gulp.hasTask('default') ? chalk.green('OK') : chalk.red('failed')
			);
		}

		console.log(chalk.yellow('Starting gulp\n'));
		gulp.start('default');
	};

	init();
}

module.exports = Devour;
