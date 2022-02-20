const isRenderer = require('is-electron-renderer')
const electron = require('electron')
const path = require('path')
const readChunk = require('read-chunk')
const fileType = require('file-type')
const extend = require('deep-extend')
const got = require('got')
const log = require('electron-log');
const WebViewer = require('@pdftron/webviewer')

const BrowserWindow = isRenderer
    ? electron.remote.BrowserWindow : electron.BrowserWindow

const PDFTRON_PATH = path.join(__dirname, 'node_modules', '@pdftron', 'webviewer', 'public', 'ui', 'index.html')
log.debug(`PDFTRON_PATH = ${PDFTRON_PATH}`)

function isAlreadyLoadedWithPDFTron(url) {
    return url.startsWith(`file://${PDFTRON_PATH}?file=`)
}

function isFile(url) {
    return url.match(/^file:\/\//i)
}

function getMimeOfFile(url) {
    const fileUrl = url.replace(/^file:\/\//i, '')
    const buffer = readChunk.sync(fileUrl, 0, 262)
    const ft = fileType(buffer)

    return ft ? ft.mime : null
}

function hasPdfExtension(url) {
    return url.match(/\.pdf$/i)
}

function isPDF(url) {
    log.debug('isPDF()', url)
    return new Promise((resolve, reject) => {
        if (isAlreadyLoadedWithPDFTron(url)) {
            resolve(false)
        } else if (isFile(url)) {
            resolve(getMimeOfFile(url) === 'application/pdf')
        } else if (hasPdfExtension(url)) {
            resolve(true)
        } else {
            got.head(url).then(res => {
                if (res.headers.location) {
                    isPDF(res.headers.location).then(isit => resolve(isit))
                        .catch(err => reject(err))
                } else {
                    resolve(res.headers['content-type'].indexOf('application/pdf') !== -1)
                }
            }).catch(err => reject(err))
        }
    })
}

class PDFTronWindow extends BrowserWindow {
    constructor(opts) {
        super(extend({}, opts, {
            webPreferences: {nodeIntegration: false}
        }))

        this.webContents.on('will-navigate', (event, url) => {
            event.preventDefault()
            this.loadURL(url)
        })

        this.webContents.on('new-window', (event, url) => {
            event.preventDefault()

            event.newGuest = new PDFTronWindow()
            event.newGuest.loadURL(url)
        })
    }

    loadURL(url, options) {
        log.debug('loadURL()', url, options)
        isPDF(url).then(isit => {
            if (isit) {
                super.loadURL(`file://webviewer.html?file=${decodeURIComponent(url)}`, options)
            } else {
                super.loadURL(url, options)
            }
        }).catch(() => super.loadURL(url, options))
    }
}

PDFTronWindow.addSupport = function (browserWindow) {
    browserWindow.webContents.on('will-navigate', (event, url) => {
        event.preventDefault()
        browserWindow.loadURL(url)
    })

    browserWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault()

        event.newGuest = new PDFTronWindow()
        event.newGuest.loadURL(url)
    })

    const load = browserWindow.loadURL
    browserWindow.loadURL = function (url, options) {
        isPDF(url).then(isit => {
            if (isit) {
                load.call(browserWindow, `file://${PDFTRON_PATH}?file=${decodeURIComponent(url)}`, options)
            } else {
                load.call(browserWindow, url, options)
            }
        })
    }
}

module.exports = PDFTronWindow
