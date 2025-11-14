# po-parser

Parses and serializes `.po` file content.

Zero-dependency. ~4kb minified.

## Usage

### Parse

```typescript
import POParser from 'po-parser';

const content = `
msgid ""
msgstr ""
"POT-Creation-Date: 2025-10-27 16:00+0000\n"

#: src/Greeting.tsx
#. Greets the user
msgid "+YJVTi"
msgstr "Hey"
`;

const result = POParser.parse(content);
```

### Serialize

```typescript
import POParser from 'po-parser';

const catalog = {
  meta: {
    'POT-Creation-Date': '2025-10-27 16:00+0000'
  },
  messages: [
    {
      id: '+YJVTi',
      message: 'Hey',
      description: 'Greets the user',
      references: [{path: 'src/Greeting.tsx'}]
    }
  ]
};

const result = POParser.serialize(catalog);
```
