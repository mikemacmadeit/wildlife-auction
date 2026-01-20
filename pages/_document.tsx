import Document, { Html, Head, Main, NextScript } from 'next/document';

/**
 * Minimal pages router Document.
 *
 * This repo primarily uses the App Router (`app/`), but some Next.js build paths
 * may still attempt to resolve `/_document`. Providing this file keeps builds stable
 * without changing any routes or runtime behavior.
 */
export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

