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
		chain = require('gulp-chain'),
		definitions = {},
		config = submerge(settings, {
			debounce: 100,
			basePath: process.cwd(),
			gulpFiles: 'gulp',
			output: 'dist'
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

		register('pipe', 'defaults', function(stream, devour) {
			if ('defaults' in config) {
				config.defaults.forEach(function(name) {
					stream = stream.pipe(devour.plugin(name));
				});
			}

			return stream;
		});

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
		['task', 'pipe'].forEach(function(what) {
			console.log([
				'  - available ' + what + 's: ',
				what in definitions ? chalk.green(Object.keys(definitions[what]).join(', ')) : chalk.yellow('none')
			].join(''));
		});
		console.log('');
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
			callback = chain(callback, devour);
		}

		definitions[type][name] = callback;
	}

	/**
	 *  Obtain a gulp plugin, initialized with given arguments
	 *  @name    plug
	 *  @access  internal
	 *  @param   string  name [automatically prefixed with 'gulp-']
	 *  @return  stream  initialized plugin
	 */
	function plug(name) {
		var part, scope, stream;

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
		stream = scope.apply(null, Array.prototype.slice.call(arguments, 1));
		//  always register an error listener
		stream.on('error', function(error) {
			console.error('Error from plugin %s: %s', chalk.red(name), error);
		});

		return stream;
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
		return gulp.src.apply(gulp, arguments)
			.pipe(devour.pipe('defaults'))
		;
	};

	/**
	 *  Invoke the predefined pipe and return its stream
	 *  @name    pipe
	 *  @access  public
	 *  @param   string  pipe
	 *  @return  stream
	 */
	devour.pipe = function(name) {
		if ('pipe' in definitions && name in definitions.pipe) {
			return definitions.pipe[name]();
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
		return gulp.dest(config.output + '/' + (relative || ''), options || {read:true});
	};

	/**
	 *  Schedule a task
	 *  @name    task
	 *  @access  public
	 *  @param   string  name
	 *  @param   mixed   build [one of: string, array]
	 *  @param   mixed   watch [optional, default undefined - the value of build, provide (bool) false to disable]
	 *  @return  devour  [chainable]
	 */
	devour.task = function(name, build, watch) {
		console.log(
			'Task %s activated\n  - build files: %s\n  - watch files: %s',
			chalk.cyan(name),
			chalk.yellow(build.join(chalk.white(', '))),
			watch !== false ? chalk.yellow((watch || build).join(chalk.white(', '))) : chalk.red('(none, not watching)')
		);

		gulp.task(name, function() {
			return definitions.task[name](devour.source(build), devour);
		});

		if (watch !== false) {
			active.push(name);
			gulp.watch(watch || build, {debounceDelay: config.debounce}, [name]);
		}

		return devour;
	};

	/**
	 *  Create a default task for all scheduled tasks and let gulp do the heavy lifting
	 *  @name    start
	 *  @access  public
	 *  @return  void
	 */
	devour.start = function() {
		console.log('');

		if (!gulp.hasTask('default')) {
			console.log(
				'No %s task found, creating it with tasks: %s',
				chalk.cyan('default'),
				active.length ? chalk.cyan(active.join(chalk.white(', '))) : chalk.red('(none)')
			);
			gulp.task('default', active);

			console.log(
				'Registered %s: %s',
				chalk.cyan('default'),
				gulp.hasTask('default') ? chalk.green('OK') : chalk.red('failed')
			);
		}

		console.log(chalk.yellow('Starting gulp\n'));
	};

	init();
}

module.exports = Devour;
