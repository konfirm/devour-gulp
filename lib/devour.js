'use strict';

/**
 *  Convenience layer around the gulp build system to provide an even more modulair/reusable build system
 */
function Devour(settings) {
	var devour = this,
		gulp = require('gulp'),
		glob = require('glob'),
		through = require('through2'),
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

	function init() {
		Object.defineProperty(devour, 'gulp', {
			enumerable: true,
			value: gulp
		});

		preload();
	}

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

	function register(type, name, callback) {
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

	devour.source = function() {
		return gulp.src.apply(gulp, arguments)
			.pipe(devour.pipe('defaults'))
		;
	};

	devour.pipe = function(name) {
		if ('pipe' in definitions && name in definitions.pipe) {
			return definitions.pipe[name]();
		}

		throw new Error('Named pipe not found: ' + name);
	};

	devour.config = function(value, otherwise) {
		return arguments.length ? config[value] || otherwise : config;
	};

	devour.write = function(relative, options) {
		return gulp.dest(config.output + '/' + (relative || ''), options || {read:true});
	};

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
