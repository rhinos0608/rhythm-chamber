# Code-Heavy Markdown Document

This document contains numerous code blocks in various programming languages to test the markdown indexer's handling of code-heavy content.

## JavaScript Examples

### Basic Functions

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}

const add = (a, b) => a + b;
```

### Async/Await

```javascript
async function fetchUserData(userId) {
  try {
    const response = await fetch(`/api/users/${userId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}
```

### Class Definition

```javascript
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(listener => {
        listener(...args);
      });
    }
  }
}
```

## Python Examples

### Data Processing

```python
import pandas as pd
import numpy as np

def process_data(data):
    """Process raw data and return cleaned DataFrame."""
    df = pd.DataFrame(data)
    df = df.dropna()
    df['normalized'] = (df['value'] - df['value'].mean()) / df['value'].std()
    return df
```

### Class Definition

```python
class DataProcessor:
    def __init__(self, config):
        self.config = config
        self.cache = {}

    def process(self, data):
        key = hash(str(data))
        if key in self.cache:
            return self.cache[key]

        result = self._transform(data)
        self.cache[key] = result
        return result

    def _transform(self, data):
        return [x * 2 for x in data]
```

### Decorators

```python
def memoize(func):
    cache = {}

    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]
    return wrapper

@memoize
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```

## TypeScript Examples

### Interface and Type

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

type ApiResponse<T> = {
  data: T;
  status: number;
  message: string;
};

async function fetchUser(id: number): Promise<ApiResponse<User>> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
```

### Generic Class

```typescript
class Repository<T> {
  private items: Map<number, T> = new Map();

  constructor(private baseUrl: string) {}

  async findById(id: number): Promise<T | null> {
    return this.items.get(id) || null;
  }

  async save(item: T): Promise<void> {
    const id = (item as any).id;
    this.items.set(id, item);
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }
}
```

## Rust Examples

### Struct and Impl

```rust
struct User {
    id: u32,
    name: String,
    email: String,
}

impl User {
    fn new(id: u32, name: &str, email: &str) -> Self {
        User {
            id,
            name: name.to_string(),
            email: email.to_string(),
        }
    }

    fn display(&self) {
        println!("User {}: {} <{}>", self.id, self.name, self.email);
    }
}
```

### Error Handling

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_file_content(path: &str) -> Result<String, io::Error> {
    let mut file = File::open(path)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content)
}

fn main() {
    match read_file_content("example.txt") {
        Ok(content) => println!("Content: {}", content),
        Err(error) => eprintln!("Error: {}", error),
    }
}
```

## Go Examples

### Struct and Methods

```go
package main

import "fmt"

type User struct {
    ID    int
    Name  string
    Email string
}

func (u *User) Display() {
    fmt.Printf("User %d: %s <%s>\n", u.ID, u.Name, u.Email)
}

func NewUser(id int, name, email string) *User {
    return &User{
        ID:    id,
        Name:  name,
        Email: email,
    }
}
```

### Goroutines and Channels

```go
func worker(id int, jobs <-chan int, results chan<- int) {
    for j := range jobs {
        fmt.Printf("Worker %d processing job %d\n", id, j)
        results <- j * 2
    }
}

func main() {
    jobs := make(chan int, 100)
    results := make(chan int, 100)

    for w := 1; w <= 3; w++ {
        go worker(w, jobs, results)
    }

    for j := 1; j <= 5; j++ {
        jobs <- j
    }
    close(jobs)

    for a := 1; a <= 5; a++ {
        <-results
    }
}
```

## SQL Examples

### Query Examples

```sql
SELECT
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 10;
```

## Shell Script Examples

### Deployment Script

```bash
#!/bin/bash

set -e

APP_NAME="myapp"
DEPLOY_DIR="/var/www/$APP_NAME"
BACKUP_DIR="/var/backups/$APP_NAME"

echo "Starting deployment..."

# Create backup
if [ -d "$DEPLOY_DIR" ]; then
    echo "Creating backup..."
    tar -czf "$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$DEPLOY_DIR" .
fi

# Pull latest code
cd "$DEPLOY_DIR"
git pull origin main

# Install dependencies
npm ci --production

# Restart service
pm2 restart "$APP_NAME"

echo "Deployment complete!"
```

## CSS Examples

### Styling

```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.button {
  display: inline-block;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.button:hover {
  background-color: #0056b3;
}
```

## HTML Examples

### Component Structure

```html
<div class="card">
  <img src="image.jpg" alt="Card image" class="card-image">
  <div class="card-content">
    <h2 class="card-title">Card Title</h2>
    <p class="card-text">This is the card description text.</p>
    <button class="card-button">Learn More</button>
  </div>
</div>
```

## JSON Examples

### Configuration

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "config": {
    "apiEndpoint": "https://api.example.com",
    "timeout": 5000,
    "retries": 3
  },
  "features": {
    "authentication": true,
    "caching": false,
    "logging": {
      "level": "info",
      "format": "json"
    }
  }
}
```

## YAML Examples

### Configuration File

```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_URL=https://api.example.com
    depends_on:
      - database

  database:
    image: postgres:14
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=secretpassword

volumes:
  db-data:
```

This document contains **12 code blocks** in various languages, demonstrating the markdown indexer's ability to handle code-heavy content with proper syntax detection and chunking behavior.
