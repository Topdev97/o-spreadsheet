# o-spreadsheet

[![npm](https://img.shields.io/npm/v/@odoo/o-spreadsheet)](https://www.npmjs.com/package/@odoo/o-spreadsheet)

A standalone spreadsheet for the web, easily integrable and extendable.

a.k.a. "[Owly](https://github.com/odoo/owl) Sheet" 🦉

- Cells, functions and formulas
- Formatting options
- Charts
- Data sorting and filtering
- Real time collaboration
- Undo/Redo
- Import/Export to excel file format
- and more...

**Try it online** with the [live demo](https://odoo.github.io/o-spreadsheet/)!

![o-spreadsheet screenshot](doc/o-spreadsheet.png "o-spreadsheet demo")

## Integrating o-spreadsheet

1. [Getting started](doc/integrating/integration.md#getting-started)
2. [Spreadsheet component props](doc/integrating/integration.md#spreadsheet-component-props)
3. [Model creation](doc/integrating/integration.md#model-creation)
4. [Collaborative edition](doc/integrating/integration.md#collaborative-edition)
5. [Translation](doc/integrating/integration.md#translation)
<!--

- use with other UI library
- use with Typescript
  -->

## Extend o-spreadsheet

o-spreadsheet lets you extend its capabilities through APIs and plugins, allowing you to create a tailored experience that aligns perfectly with your needs.

1. [Architecture](doc/extending/architecture.md)
2. [Custom function](doc/add_function.md)
3. [Business feature](doc/extending/business_feature.md)
4. Menu items (under construction)
5. Side panel (under construction)
6. Notification (under construction)
7. Export Excel (under construction)
8. [Terminology](doc/o-spreadsheet_terminology.png)
9. [API](doc/tsdoc/README.md)

## Run it!

```bash
# install dependencies
npm install

# build o_spreadsheet.js in dist/
npm run build

# build stuff, start a live server, start a collaborative server, build with --watch
npm run dev

# run the test suite
npm run test
npm run test -- --watch

# build documentation
npm run doc
```

## Contributing

- Open a pull request or an issue on this repository.
- Make sure you have [signed the CLA](https://github.com/odoo/odoo/blob/16.0/doc/cla/sign-cla.md) on [odoo repository](https://github.com/odoo/odoo).

Most of [odoo contribution guidelines](https://github.com/odoo/odoo/wiki/Contributing#making-pull-requests) apply here.
