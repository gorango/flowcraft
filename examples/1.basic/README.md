# Article Writing Workflow

A `workflow` example that demonstrates an article writing workflow using a sequence of `Node`s and `Flow`.

## Features

- **Generate Outline**: Creates a simple outline with up to 3 main sections using YAML structured output.
- **Write Content**: Uses a `BatchNode`-like pattern within a single Node to write concise content for each section.
- **Apply Style**: Applies a conversational, engaging style to the final article.

## How to Run

1. **Install dependencies**:

    ```bash
    npm install
    ```

2. **Set your OpenAI API key**:
    Create a `.env` file in this directory or set an environment variable:

    ```
    OPENAI_API_KEY="your-api-key-here"
    ```

3. **Run the application**:

    ```bash
    npm start
    ```

    To specify a topic, pass it as an argument:

    ```bash
    npm start -- "The Future of Renewable Energy"
    ```

## How It Works

The workflow consists of three sequential nodes:

```mermaid
graph LR
    Outline[Generate Outline] --> Write[Write Content]
    Write --> Style[Apply Style]
