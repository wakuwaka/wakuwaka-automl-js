# wakuwaka-automl-js

[in-browser, zero setup demo](https://gifted-newton-e80eef.netlify.com/)

A versatile framework for automated machine learning (AutoML) implementations in JavaScript. It can be executed locally either in browser or on a,nodejs server. The project comprises ground up implementation of machine learning algorithms for tasks such as regression and classification which includes decision trees, linear models and gradient boosted decision trees. Benchmarking against the well-regarded `scikit-learn` library, it has been observed to yield close, albeit marginally lower (at most 1 percent) scores.

# Installation

This code is designed to be used directly in-browser through a standard script import:

```html
<script src=./dist/wakuwaka-automljs.js></script>
```

Upon successful import, a global `aml` object is created that can be further utilized for model instantiation, data processing, and splitting. For Node.js use, npm can be used for package installation which can then be imported using `require`.

# Documentation and Examples

For more information on objects and functions of automljs, visit [https://automl-js.github.io/automl-js/](https://automl-js.github.io/automl-js/). Further examples of functionality can be found in the `tests` folder. Examples provided below demonstrate the basic usage of the code.

# Example automl estimator

```javascript
// automl-js uses asynchronous functionality of JavaScript
async function main(){}//code continues...```

# Example learning with estimator

The code designed for browser execution. For use with Node.js, simply install the package with npm and import using `require`.

```html
<script src=./dist/wakuwaka-automljs.js></script>

<script>//code continues...```