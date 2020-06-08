var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { join, normalize, basename, resolve, sep } from 'path';
import fs from 'fs-plus';
import { statSync, existsSync } from 'fs';
import colors from 'colors';
import glob from 'glob';
import Svgo from 'svgo';
export default function build(options) {
    return new Promise((res, reject) => {
        const tplPath = options.tpl
            ? join(process.cwd(), options.tpl)
            : resolve(__dirname, `..${sep}default${sep}icon.tpl${options.es6 ? '.es6' : ''}.txt`);
        const tpl = fs.readFileSync(tplPath, 'utf8');
        const svgo = new Svgo(getSvgoConfig(options.svgo));
        glob(join(options.sourcePath, `**${sep}*.svg`), function (err, files) {
            if (err) {
                reject(err);
                return;
            }
            files
                .map(filename => normalize(filename))
                .map(filename => {
                const name = basename(filename).split('.').slice(0, -1).join('.');
                const filePath = getFilePath(options.sourcePath, filename, options.subDir);
                const fullPath = join(options.targetPath, name + `.${options.ext}`);

                return {
                    filename,
                    name,
                    filePath,
                    fullPath,
                    lastMod: statSync(filename).mtimeMs
                };
            })
                .filter(isFileChanged)
                .forEach(({ filename, name, filePath, fullPath, lastMod }, ix) => __awaiter(this, void 0, void 0, function* () {
                let svgContent = fs.readFileSync(filename, 'utf-8');
                let result = (yield svgo.optimize(svgContent));
                let data = result.data
                    .replace(/<svg[^>]+>/gi, '')
                    .replace(/<\/svg>/gi, '');

                let viewBox = getViewBox(result);
                data = addPid(data);
                if (options.renameStyles) {
                    data = renameStyle(data);
                }
                data = changeId(data, filePath, name, options.idSP);
                data = data.replace(/\'/g, '\\\'');

                let content = compile(tpl, {
                    name: `${filePath}${name}`,
                    width: parseFloat(result.info.width) || 16,
                    height: parseFloat(result.info.height) || 16,
                    viewBox: `'${viewBox}'`,
                    data: data,
                    lastMod: lastMod
                });
                try {
                    fs.writeFileSync(fullPath, content, 'utf-8');
                    console.log(colors.yellow(`Generated icon: ${filePath}${name}`));
                    if (ix === files.length - 1) {
                        generateIndex(options, files);
                        res();
                    }
                }
                catch (err) {
                    reject(err);
                }
            }));
        });
    });
}
function isFileChanged({ filePath, fullPath, lastMod }) {
    if (!existsSync(join(process.cwd(), fullPath))) {
        return true;
    }
    try {
        const file = fs.readFileSync(fullPath, 'utf-8');
        const matches = file.match(/lastMod: '(\d+(?:\.\d+)?)'/i);
        const lastModOld = +matches[1];
        return lastMod !== lastModOld;
    }
    catch (e) {
        return true;
    }
}
function compile(content, data) {
    return content.replace(/\${(\w+)}/gi, function (match, name) {
        return data[name] ? data[name] : '';
    });
}
function getFilePath(sourcePath, filename, subDir = '') {
    let filePath = filename
        .replace(resolve(sourcePath), '')
        .replace(basename(filename), '');
    if (subDir) {
        filePath = filePath.replace(subDir + sep, '');
    }
    if (/^[\/\\]/.test(filePath)) {
        filePath = filePath.substr(1);
    }
    return filePath.replace(/[\/\\]/g, sep);
}
function generateIndex(opts, files, subDir = '') {
    let isES6 = opts.es6;
    let content = '';
    let dirMap = {};
    switch (opts.ext) {
        case 'js':
            content += '/* eslint-disable */\n';
            break;
        case 'ts':
            content += '/* tslint:disable */\n';
            break;
    }
    files.forEach(file => {
        let name = basename(file).split('.')[0];
        let filePath = getFilePath(opts.sourcePath, file, subDir);
        filePath = filePath.replace(opts.subDir + '/', '');
        let dir = filePath.split('/')[0];
        console.log('------------------------------------------------')
        console.log('dir ', dir);
        // if (dir) {
        //     if (!dirMap[dir]) {
        //       dirMap[dir] = [];
        //       content += isES6
        //           ? `import './${dir}/index.js'\n`
        //           : `require('./${dir}/index.js')\n`;
        //     }
        //     dirMap[dir].push(file);
        //   } else {
            content += isES6
                ? `import './${name}.js'\n`
                : `require('./${name}.js')\n`;
        //   }
    });
    fs.writeFileSync(join(opts.targetPath, subDir.replace(opts.sourcePath, ''), `index.${opts.ext}`), content, 'utf-8');    
    for (let dir in dirMap) {
        // join(subDir, dir)
        generateIndex(opts, dirMap[dir], join(subDir, dir));
    }
}
function getSvgoConfig(svgo) {
    if (!svgo) {
        return require('../default/svgo');
    }
    else if (typeof svgo === 'string') {
        return require(join(process.cwd(), svgo));
    }
    else {
        return svgo;
    }
}
function getViewBox(svgoResult) {
    let viewBoxMatch = svgoResult.data.match(/viewBox="([-\d\.]+\s[-\d\.]+\s[-\d\.]+\s[-\d\.]+)"/);
    let viewBox = '0 0 200 200';
    if (viewBoxMatch && viewBoxMatch.length > 1) {
        viewBox = viewBoxMatch[1];
    }
    else if (svgoResult.info.height && svgoResult.info.width) {
        viewBox = `0 0 ${svgoResult.info.width} ${svgoResult.info.height}`;
    }
    return viewBox;
}
function addPid(content) {
    let shapeReg = /<(path|rect|circle|polygon|line|polyline|ellipse)\s/gi;
    let id = 0;
    content = content.replace(shapeReg, function (match) {
        return match + `pid="${id++}" `;
    });
    return content;
}
function renameStyle(content) {
    let styleShaeReg = /<(path|rect|circle|polygon|line|polyline|g|ellipse).+>/gi;
    let styleReg = /fill=\"|stroke="/gi;
    content = content.replace(styleShaeReg, function (shape) {
        return shape.replace(styleReg, function (styleName) {
            return '_' + styleName;
        });
    });
    return content;
}
function changeId(content, filePath, name, idSep = '_') {
    let idReg = /svgicon(\w+)/g;

    content = content.replace(idReg, function (match, elId) {
        return `svgicon${idSep}${filePath.replace(/[\\\/]/g, idSep)}${name}${idSep}${elId}`;
    });
    return content;
}
