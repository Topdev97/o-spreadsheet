import { ElementSchema, extract } from "../../src/xlsx/xml";

describe("extract xml with js schema", () => {
  test("extract a single element", () => {
    const schema = {
      name: "person",
    };
    const xml = "<person/>";
    expect(extract(schema, xml)).toEqual({
      person: {},
    });
  });
  test("an element with a value", () => {
    const schema = {
      name: "person",
    };
    const xml = "<person>John</person>";
    expect(extract(schema, xml)).toEqual({
      person: "John",
    });
  });
  test("an number value", () => {
    const schema: ElementSchema = {
      name: "age",
      type: "number",
    };
    const xml = "<age>13</age>";
    expect(extract(schema, xml)).toEqual({
      age: 13,
    });
  });
  test("a wrong number value", () => {
    const schema: ElementSchema = {
      name: "age",
      type: "number",
    };
    const xml = "<age>this is not a number</age>";
    expect(() => extract(schema, xml)).toThrow("Expected number but found 'this is not a number'");
  });
  test("an element with an escaped value", () => {
    const schema = {
      name: "person",
    };
    const xml = "<person>&lt;John&gt;</person>";
    expect(extract(schema, xml)).toEqual({
      person: "<John>",
    });
  });
  test("element not found", () => {
    const schema = {
      name: "person",
    };
    const xml = "<city/>";
    expect(() => extract(schema, xml)).toThrow("Expected 'person' but found 'city'");
  });
  test("element with an attribute", () => {
    const schema = {
      name: "person",
      attributes: [{ name: "age" }],
    };
    const xml = '<person age="12"/>';
    expect(extract(schema, xml)).toEqual({
      person: { age: "12" },
    });
  });
  test("an element with a content and an attribute", () => {
    const schema = {
      name: "person",
      attributes: [{ name: "age" }],
    };
    const xml = '<person age="12">John</person>';
    expect(extract(schema, xml)).toEqual({
      person: "John",
    });
  });
  test("element with a namespaced attribute", () => {
    const schema = {
      name: "person",
      attributes: [{ name: "age", namespace: { uri: "http://example.com" } }],
    };
    const xml = /*xml*/ `
      <person xmlns:a="http://example.com" a:age="12"></person>`;
    expect(extract(schema, xml)).toEqual({
      person: { age: "12" },
    });
  });
  test("element with another namespaced attribute", () => {
    const schema = {
      name: "person",
      attributes: [{ name: "age", namespace: { uri: "http://example.com" } }],
    };
    const xml = /*xml*/ `
      <person xmlns:a="http://other.com" a:age="12"></person>`;
    expect(() => extract(schema, xml)).toThrow("Expected 'person' to have attribute 'age'");
  });
  test("attribute not found", () => {
    const schema = {
      name: "person",
      attributes: [{ name: "age" }],
    };
    const xml = '<person name="John"/>';
    expect(() => extract(schema, xml)).toThrow("Expected 'person' to have attribute 'age'");
  });

  test("extract a child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }],
    };
    const xml = "<person><address>London</address></person>";
    expect(extract(schema, xml)).toEqual({
      person: {
        address: "London",
      },
    });
  });
  test("extract an optional child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address", quantifier: "optional" }],
    };
    const xml = "<person><address/></person>";
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
      },
    });
  });
  test("missing optional child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address", quantifier: "optional" }],
    };
    const xml = "<person/>";
    expect(extract(schema, xml)).toEqual({
      person: {},
    });
  });
  test("extract a sequence of children in the correct order", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }, { name: "age" }],
    };
    const xml = /*xml*/ `<person><address/><age/></person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
        age: {},
      },
    });
  });
  test("cannot extract a sequence of children in the wrong order", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }, { name: "age" }],
    };
    const xml = /*xml*/ `<person><age/><address/></person>`;
    expect(() => extract(schema, xml)).toThrow("Missing child: 'age'");
  });
  test("extract nested child ", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address", children: [{ name: "city" }] }],
    };
    const xml = /*xml*/ `
      <person>
        <address>
          <city>London</city>
        </address>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: { city: "London" },
      },
    });
  });
  test("ignore unknown child elements", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }],
    };
    const xml = "<person><age/><address/><job/></person>";
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
      },
    });
  });
  test("cannot extract a missing child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }],
    };
    const xml = "<person></person>";
    expect(() => extract(schema, xml)).toThrow("Missing child: 'address'");
  });
  test("cannot extract a missing required child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address", quantifier: "required" }],
    };
    const xml = "<person></person>";
    expect(() => extract(schema, xml)).toThrow("Missing child: 'address'");
  });
  test("with an wrong child", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [{ name: "address" }],
    };
    const xml = "<person><age>42</age></person>";
    expect(() => extract(schema, xml)).toThrow("Missing child: 'address'");
  });
  test("schema with many quantifier extracts many elements", () => {
    const schema: ElementSchema = {
      name: "country",
      children: [{ name: "city", quantifier: "many" }],
    };
    const xml = /*xml*/ `
      <country>
        <city>London</city>
        <city>Edinburgh</city>
      </country>`;
    expect(extract(schema, xml)).toEqual({
      country: {
        city: ["London", "Edinburgh"],
      },
    });
  });
  test("schema with many quantifier extracts nested elements", () => {
    const schema: ElementSchema = {
      name: "person",
      children: [
        {
          name: "friend",
          quantifier: "many",
          children: [{ name: "name" }],
        },
      ],
    };
    const xml = /*xml*/ `
      <person>
        <friend><name>Raoul</name></friend>
        <friend><name>Georges</name></friend>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        friend: [{ name: "Raoul" }, { name: "Georges" }],
      },
    });
  });
  test("schema with many quantifier does not extract from empty parent", () => {
    const schema: ElementSchema = {
      name: "country",
      children: [{ name: "city", quantifier: "many" }],
    };
    const xml = /*xml*/ `<country></country>`;
    expect(extract(schema, xml)).toEqual({
      country: { city: [] },
    });
  });
  test("extract a default namespaced child", () => {
    const namespace = "http://example.com";
    const schema: ElementSchema = {
      name: "person",
      namespace: { uri: namespace },
      children: [{ name: "address" }],
    };
    const xml = /*xml*/ `
      <person xmlns="http://example.com">
        <address/>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
      },
    });
  });
  test("extract a prefixed namespaced child", () => {
    const namespace = "http://example.com";
    const schema: ElementSchema = {
      name: "person",
      namespace: { uri: namespace, prefix: "a" },
      children: [{ name: "address" }],
    };
    const xml = /*xml*/ `
      <person xmlns:a="http://example.com">
        <a:address/>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
      },
    });
  });
  test("extract a different prefixed namespaced child", () => {
    const namespace = "http://example.com";
    const schema: ElementSchema = {
      name: "person",
      // namespace URI is the same but the prefix is different
      namespace: { uri: namespace, prefix: "a" },
      children: [{ name: "address" }],
    };
    const xml = /*xml*/ `
      <person xmlns:b="http://example.com">
        <b:address/>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {},
      },
    });
  });
  test("extract nested prefixed namespaced children", () => {
    const namespace = "http://example.com";
    const schema: ElementSchema = {
      name: "person",
      namespace: { uri: namespace, prefix: "a" },
      children: [
        {
          name: "address",
          children: [{ name: "city", namespace: { uri: "http://city.com" } }],
        },
      ],
    };
    const xml = /*xml*/ `
      <person xmlns:a="http://example.com">
        <a:address xmlns:c="http://city.com">
          <c:city>London</c:city>
        </a:address>
      </person>`;
    expect(extract(schema, xml)).toEqual({
      person: {
        address: {
          city: "London",
        },
      },
    });
  });
  test("does not extract other prefixed children from another namespace", () => {
    const namespaceB = "http://B.com";
    const schema: ElementSchema = {
      name: "country",
      namespace: { uri: namespaceB },
      children: [{ name: "city" }],
    };
    const xml = /*xml*/ `
      <country xmlns:a="http://A.com" xmlns:b="http://B.com">
        <a:city>London</a:city>
        <b:city>Edinburgh</b:city>
        <a:city>York</a:city>
      </country>`;
    expect(extract(schema, xml)).toEqual({
      country: { city: "Edinburgh" },
    });
  });
});
