'use strict'

var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault')

Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.default = void 0

var _hastUtilFromParse = _interopRequireDefault(
  require('hast-util-from-parse5'),
)

var _parse = _interopRequireDefault(require('parse5'))

var _unistUtilVisit = _interopRequireDefault(require('unist-util-visit'))

// results in an AST node of type "root" with a single "children" node of type "element"
// so we return the first (and only) child "element" node
const htmlToHast = string =>
  (0, _hastUtilFromParse.default)(_parse.default.parseFragment(string))
    .children[0]

const getUrlString = url => {
  const urlString = url.startsWith('http') ? url : `https://${url}`

  try {
    return new URL(urlString).toString()
  } catch (error) {
    return null
  }
}

const remarkEmbedder = ({cache, transformers, handleError, isAsync}) => {
  const asyncHandler = remarkEmbedderAsync({cache, transformers, handleError})
  const syncHandler = remarkEmbedderSync({cache, transformers, handleError})
  return tree => {
    if (isAsync && isAsync()) {
      return asyncHandler(tree)
    } else {
      return syncHandler(tree)
    }
  }
}

const getNodes = tree => {
  const nodeAndURL = []
  ;(0, _unistUtilVisit.default)(tree, 'paragraph', paragraphNode => {
    if (paragraphNode.children.length !== 1) {
      return
    }

    const {children} = paragraphNode
    const node = children[0]
    const isText = node.type === 'text' // it's a valid link if there's no title, and the value is the same as the URL

    const isValidLink =
      node.type === 'link' &&
      node.title === null &&
      node.children.length === 1 &&
      node.children[0].value === node.url

    if (!isText && !isValidLink) {
      return
    }

    const {url, value = url} = node
    const urlString = getUrlString(value)

    if (!urlString) {
      return
    }

    nodeAndURL.push({
      parentNode: paragraphNode,
      url: urlString,
    })
  })
  return nodeAndURL
}

const remarkEmbedderAsync = ({cache, transformers, handleError}) => {
  // convert the array of transformers to one with both the transformer and the config tuple
  const transformersAndConfig = transformers.map(t =>
    Array.isArray(t)
      ? {
          config: t[1],
          transformer: t[0],
        }
      : {
          transformer: t,
        },
  )
  return async tree => {
    const nodeAndURL = getNodes(tree)
    const nodesToTransform = []

    for (const node of nodeAndURL) {
      for (const transformerAndConfig of transformersAndConfig) {
        // we need to make sure this is completed in sequence
        // because the order matters
        // eslint-disable-next-line no-await-in-loop
        if (await transformerAndConfig.transformer.shouldTransform(node.url)) {
          nodesToTransform.push({...node, ...transformerAndConfig})
          break
        }
      }
    }

    const promises = nodesToTransform.map(
      async ({parentNode, url, transformer, config}) => {
        const errorMessageBanner = `The following error occurred while processing \`${url}\` with the remark-embedder transformer \`${transformer.name}\`:`

        try {
          const cacheKey = `remark-embedder:${transformer.name}:${url}`
          let html = await (cache == null ? void 0 : cache.get(cacheKey))

          if (!html) {
            try {
              var _html$trim, _html

              html = await transformer.getHTML(url, config)
              html =
                (_html$trim = (_html = html) == null ? void 0 : _html.trim()) !=
                null
                  ? _html$trim
                  : null
              await (cache == null ? void 0 : cache.set(cacheKey, html))
            } catch (e) {
              if (handleError) {
                var _html$trim2, _html2

                const error = e
                console.error(`${errorMessageBanner}\n\n${error.message}`)
                html = await handleError({
                  error,
                  url,
                  transformer,
                  config,
                })
                html =
                  (_html$trim2 =
                    (_html2 = html) == null ? void 0 : _html2.trim()) != null
                    ? _html$trim2
                    : null
              } else {
                throw e
              }
            }
          } // if nothing's returned from getHTML, then no modifications are needed

          if (!html) {
            return
          } // convert the HTML string into an AST

          const htmlElement = htmlToHast(html) // set the parentNode.data with the necessary properties

          parentNode.data = {
            hChildren: htmlElement.children,
            hName: htmlElement.tagName,
            hProperties: htmlElement.properties,
          }
        } catch (e) {
          const error = e
          error.message = `${errorMessageBanner}\n\n${error.message}`
          throw error
        }
      },
    )
    await Promise.all(promises)
    return tree
  }
}

const remarkEmbedderSync = ({cache, transformers, handleError}) => {
  // convert the array of transformers to one with both the transformer and the config tuple
  const transformersAndConfig = transformers.map(t =>
    Array.isArray(t)
      ? {
          config: t[1],
          transformer: t[0],
        }
      : {
          transformer: t,
        },
  )
  return tree => {
    const nodeAndURL = getNodes(tree)
    const nodesToTransform = []

    for (const node of nodeAndURL) {
      for (const transformerAndConfig of transformersAndConfig) {
        // we need to make sure this is completed in sequence
        // because the order matters
        if (transformerAndConfig.transformer.shouldTransform(node.url)) {
          nodesToTransform.push({...node, ...transformerAndConfig})
          break
        }
      }
    }

    nodesToTransform.forEach(({parentNode, url, transformer, config}) => {
      const errorMessageBanner = `The following error occurred while processing \`${url}\` with the remark-embedder transformer \`${transformer.name}\`:`

      try {
        const cacheKey = `remark-embedder:${transformer.name}:${url}`
        let html = cache == null ? void 0 : cache.get(cacheKey)

        if (!html) {
          try {
            var _html$trim, _html

            html = transformer.getHTML(url, config)
            html =
              (_html$trim = (_html = html) == null ? void 0 : _html.trim()) !=
              null
                ? _html$trim
                : null
            cache == null ? void 0 : cache.set(cacheKey, html)
          } catch (e) {
            if (handleError) {
              var _html$trim2, _html2

              const error = e
              console.error(`${errorMessageBanner}\n\n${error.message}`)
              html = handleError({
                error,
                url,
                transformer,
                config,
              })
              html =
                (_html$trim2 =
                  (_html2 = html) == null ? void 0 : _html2.trim()) != null
                  ? _html$trim2
                  : null
            } else {
              throw e
            }
          }
        } // if nothing's returned from getHTML, then no modifications are needed

        if (!html) {
          return
        } // convert the HTML string into an AST

        const htmlElement = htmlToHast(html) // set the parentNode.data with the necessary properties

        parentNode.data = {
          hChildren: htmlElement.children,
          hName: htmlElement.tagName,
          hProperties: htmlElement.properties,
        }
      } catch (e) {
        const error = e
        error.message = `${errorMessageBanner}\n\n${error.message}`
        throw error
      }
    })
    return tree
  }
}

var _default = remarkEmbedder
/*
eslint
  @typescript-eslint/no-explicit-any: "off",
*/

exports.default = _default
