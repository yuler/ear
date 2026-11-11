use ear::commands;
use ear::emit::emit_json;
use serde_json::json;
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(sub) = args.first().map(|s| s.as_str()) else {
        eprintln!("Usage: ear <parse|captions|download|open> [args...]");
        eprintln!("Run `ear --version` to inspect protocol schema version.");
        process::exit(1);
    };

    let res = match sub {
        "--version" | "-v" | "version" => {
            println!("ear {} (schema v1)", env!("CARGO_PKG_VERSION"));
            return;
        }
        "parse" => {
            let input = args.get(1).map(|s| s.as_str()).unwrap_or("");
            commands::parse::run(input)
        }
        "captions" => commands::captions::run(&args[1..]),
        "download" => commands::download::run(&args[1..]),
        "open" | "files" | "file" | "reveal" => {
            let target = if args.len() > 1 {
                args[1..].join(" ")
            } else {
                String::new()
            };
            commands::open::run(&target)
        }
        _ => Err(format!("Unknown subcommand: {sub}")),
    };

    if let Err(err) = res {
        emit_json(json!({
            "v": 1,
            "type": "error",
            "message": err
        }));
        process::exit(1);
    }
}
