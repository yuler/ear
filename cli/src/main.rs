mod commands;
mod emit;
mod types;
mod youtube;

use emit::emit_json;
use serde_json::json;
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(sub) = args.first().map(|s| s.as_str()) else {
        eprintln!("Usage: ear <parse|captions|download|open> [args...]");
        process::exit(1);
    };

    let res = match sub {
        "parse" => {
            let input = args.get(1).map(|s| s.as_str()).unwrap_or("");
            commands::parse::run(input)
        }
        "captions" => {
            let url = args.get(1).map(|s| s.as_str()).unwrap_or("");
            commands::captions::run(url)
        }
        "download" => commands::download::run(&args[1..]),
        "open" => {
            let target = args.get(1).map(|s| s.as_str()).unwrap_or("");
            commands::open::run(target)
        }
        _ => Err(format!("Unknown subcommand: {sub}")),
    };

    if let Err(err) = res {
        emit_json(json!({
            "type": "error",
            "message": err
        }));
        process::exit(1);
    }
}
