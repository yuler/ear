use serde_json::Value;
use std::io::{self, Write};

pub fn emit_json(val: Value) {
    println!("{}", val);
    let _ = io::stdout().flush();
}
