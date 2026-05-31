#[test]
fn debug_test() {
    use pulldown_cmark::{Parser, Options, html};
    let opts = Options::ENABLE_STRIKETHROUGH;
    let parser = Parser::new_ext("~~strike~~ and ~sub~", opts);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    eprintln!("OUTPUT: {}", out);
    assert!(false, "output: {}", out);
}
